/**
 * Handball Analyzer - submission endpoint (Google Apps Script Web App)
 *
 * Receives CSV from the student's app and:
 *   - upserts rows into the teacher's Google Sheet
 *     (same student_name + date + opponent => old rows replaced)
 *   - archives the original CSV file into a Drive folder
 */

// ----- Config (already set for this team) -----
// Sheet : https://docs.google.com/spreadsheets/d/1j3sbt8hohug2wOTynup6w3NQ3qw-n8nvNQBEwKOp954/edit
// Folder: https://drive.google.com/drive/folders/1TTKZz6JJLSFNFf64PAE87O3VtW-T-IAT
var SHEET_ID  = '1j3sbt8hohug2wOTynup6w3NQ3qw-n8nvNQBEwKOp954';
var FOLDER_ID = '1TTKZz6JJLSFNFf64PAE87O3VtW-T-IAT';

// Columns prepended to each Sheet row
var PREFIX_COLS = ['submitted_at', 'student_name'];

function doGet(e) {
  return ContentService.createTextOutput(
    'Handball Analyzer endpoint is ready. POST CSV here.'
  );
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var studentName = (body.studentName || '').toString().trim();
    var matchDate   = (body.matchDate   || '').toString().trim();
    var opponent    = (body.opponent    || '').toString().trim();
    var filename    = (body.filename    || 'match.csv').toString();
    var csv         = (body.csv         || '').toString();

    if (!csv) {
      return jsonResponse({ ok: false, error: 'empty csv' });
    }
    if (!studentName) {
      return jsonResponse({ ok: false, error: 'studentName required' });
    }

    var replaced = false;
    var rowsAdded = 0;

    if (SHEET_ID) {
      var result = upsertCsvToSheet(csv, studentName, matchDate, opponent);
      replaced  = result.replaced;
      rowsAdded = result.rowsAdded;
    }

    if (FOLDER_ID) {
      var folder = DriveApp.getFolderById(FOLDER_ID);
      var studentSafe = safeName(studentName);
      var targetName  = studentSafe + '__' + filename;
      var existing = folder.getFilesByName(targetName);
      while (existing.hasNext()) {
        existing.next().setTrashed(true);
      }
      folder.createFile(targetName, csv, 'text/csv');
    }

    return jsonResponse({ ok: true, replaced: replaced, rowsAdded: rowsAdded });
  } catch (err) {
    var detail = (err && err.stack) ? err.stack : String(err);
    return jsonResponse({ ok: false, error: detail });
  }
}

function upsertCsvToSheet(csv, studentName, matchDate, opponent) {
  var sheet = SpreadsheetApp.openById(SHEET_ID).getActiveSheet();

  // Strip BOM (U+FEFF) if present, split lines, drop empties
  var clean = (csv.charCodeAt(0) === 0xFEFF) ? csv.substring(1) : csv;
  var rawLines = clean.split(/\r?\n/);
  var lines = [];
  for (var li = 0; li < rawLines.length; li++) {
    if (rawLines[li].length > 0) lines.push(rawLines[li]);
  }
  if (lines.length < 2) {
    return { replaced: false, rowsAdded: 0 };
  }

  var headers = parseCsvLine(lines[0]);
  var dataRows = [];
  for (var di = 1; di < lines.length; di++) {
    dataRows.push(parseCsvLine(lines[di]));
  }

  var fullHeaders = PREFIX_COLS.concat(headers);

  // Insert header row if Sheet is empty
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, fullHeaders.length).setValues([fullHeaders]);
  }

  // Find and delete existing rows matching (student_name, date, opponent)
  // Column order: 1=submitted_at, 2=student_name, 3=date, 4=opponent
  var replaced = false;
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    var range = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn());
    var values = range.getValues();
    var rowsToDelete = [];
    for (var i = 0; i < values.length; i++) {
      var row = values[i];
      if (String(row[1]) === studentName
          && String(row[2]) === matchDate
          && String(row[3]) === opponent) {
        rowsToDelete.push(i + 2);
      }
    }
    if (rowsToDelete.length > 0) {
      replaced = true;
      rowsToDelete.sort(function (a, b) { return b - a; });
      for (var d = 0; d < rowsToDelete.length; d++) {
        sheet.deleteRow(rowsToDelete[d]);
      }
    }
  }

  // Append new rows
  var submittedAt = new Date();
  var newRows = [];
  for (var r = 0; r < dataRows.length; r++) {
    newRows.push([submittedAt, studentName].concat(dataRows[r]));
  }
  if (newRows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, newRows[0].length).setValues(newRows);
  }
  return { replaced: replaced, rowsAdded: newRows.length };
}

function parseCsvLine(line) {
  var result = [];
  var cur = '';
  var inQuotes = false;
  for (var i = 0; i < line.length; i++) {
    var ch = line.charAt(i);
    if (inQuotes) {
      if (ch === '"') {
        if (line.charAt(i + 1) === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === ',') {
        result.push(cur);
        cur = '';
      } else if (ch === '"') {
        inQuotes = true;
      } else {
        cur += ch;
      }
    }
  }
  result.push(cur);
  return result;
}

function safeName(s) {
  var str = String(s || 'anon');
  var cleaned = str.replace(/[\/\\?%*:|"<>]/g, '_');
  return cleaned.substring(0, 30);
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
