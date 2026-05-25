/**
 * Handball Analyzer — submission endpoint (Google Apps Script Web App)
 *
 * 生徒のアプリから POST された CSV を、教師の Google Sheet に追記し、
 * 同一 (student_name, date, opponent) があれば置換する。
 * 元の CSV ファイルもバックアップ用に Drive フォルダへ保存。
 *
 * セットアップ手順は同じディレクトリの README.md を参照。
 */

// ── 設定 ── 自分の Sheet ID とフォルダ ID に書き換えてください
const SHEET_ID  = 'PASTE_YOUR_GOOGLE_SHEET_ID_HERE';
const FOLDER_ID = 'PASTE_YOUR_DRIVE_FOLDER_ID_HERE';

// Sheet 全体の列順 — CSV のヘッダーに submitted_at と student_name を前置する
const PREFIX_COLS = ['submitted_at', 'student_name'];

function doGet(e) {
  return ContentService.createTextOutput(
    'Handball Analyzer endpoint is ready. POST CSV here.'
  );
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const studentName = (body.studentName || '').toString().trim();
    const matchDate   = (body.matchDate   || '').toString().trim();
    const opponent    = (body.opponent    || '').toString().trim();
    const filename    = (body.filename    || 'match.csv').toString();
    const csv         = (body.csv         || '').toString();

    if (!csv) {
      return jsonResponse({ ok: false, error: 'empty csv' });
    }
    if (!studentName) {
      return jsonResponse({ ok: false, error: 'studentName required' });
    }

    let replaced = false;
    let rowsAdded = 0;

    // 1. Sheet への追記（置換モード）
    if (SHEET_ID && SHEET_ID !== 'PASTE_YOUR_GOOGLE_SHEET_ID_HERE') {
      const result = upsertCsvToSheet(csv, studentName, matchDate, opponent);
      replaced  = result.replaced;
      rowsAdded = result.rowsAdded;
    }

    // 2. Drive フォルダにCSVファイルを保存（同名は置換）
    if (FOLDER_ID && FOLDER_ID !== 'PASTE_YOUR_DRIVE_FOLDER_ID_HERE') {
      const folder = DriveApp.getFolderById(FOLDER_ID);
      const studentSafe = safeName(studentName);
      const targetName  = studentSafe + '__' + filename;
      // 既存の同名ファイルをゴミ箱へ
      const existing = folder.getFilesByName(targetName);
      while (existing.hasNext()) existing.next().setTrashed(true);
      folder.createFile(targetName, csv, 'text/csv');
    }

    return jsonResponse({ ok: true, replaced: replaced, rowsAdded: rowsAdded });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err && err.stack || err) });
  }
}

function upsertCsvToSheet(csv, studentName, matchDate, opponent) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();
  // BOM を取り除いて行に分割
  const rawLines = csv.replace(/^﻿/, '').split(/\r?\n/).filter(function (l) {
    return l.length > 0;
  });
  if (rawLines.length < 2) return { replaced: false, rowsAdded: 0 };

  const headers   = parseCsvLine(rawLines[0]);
  const dataRows  = rawLines.slice(1).map(parseCsvLine);
  const fullHeaders = PREFIX_COLS.concat(headers);

  // ヘッダー行が空なら追加
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, fullHeaders.length).setValues([fullHeaders]);
  }

  // (student_name, date, opponent) 一致の既存行を削除
  // Sheet 列順: 1=submitted_at, 2=student_name, 3=date, 4=opponent, ...
  let replaced = false;
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const range = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
    const values = range.getValues();
    const rowsToDelete = [];
    for (let i = 0; i < values.length; i++) {
      const row = values[i];
      if (String(row[1]) === studentName
          && String(row[2]) === matchDate
          && String(row[3]) === opponent) {
        rowsToDelete.push(i + 2); // 1-indexed + ヘッダー行
      }
    }
    if (rowsToDelete.length > 0) {
      replaced = true;
      // 後ろから消す（インデックスがズレないように）
      rowsToDelete.sort(function (a, b) { return b - a; });
      rowsToDelete.forEach(function (rn) { sheet.deleteRow(rn); });
    }
  }

  // 新規行を追加
  const submittedAt = new Date();
  const newRows = dataRows.map(function (cells) {
    return [submittedAt, studentName].concat(cells);
  });
  if (newRows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
  }
  return { replaced: replaced, rowsAdded: newRows.length };
}

function parseCsvLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line.charAt(i);
    if (inQuotes) {
      if (ch === '"') {
        if (line.charAt(i + 1) === '"') { cur += '"'; i++; }
        else { inQuotes = false; }
      } else {
        cur += ch;
      }
    } else {
      if (ch === ',') { result.push(cur); cur = ''; }
      else if (ch === '"') { inQuotes = true; }
      else { cur += ch; }
    }
  }
  result.push(cur);
  return result;
}

function safeName(s) {
  return String(s || 'anon').replace(/[\/\\?%*:|"<>]/g, '_').slice(0, 30);
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
