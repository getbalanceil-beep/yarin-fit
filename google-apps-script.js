/**
 * קוד חיבור ענן עבור האפליקציה של ירין (Google Apps Script)
 * 
 * הוראות התקנה חד-פעמית (דקה אחת):
 * 1. פתח את טבלת ה-Google Sheets שלך במחשב.
 * 2. בתפריט העליון לחץ על: Extensions (תוספים) -> Apps Script.
 * 3. מחק את מה שכתוב שם והדבק את כל הקוד הזה.
 * 4. לחץ למעלה בצד ימין על הכפתור הכחול Deploy (פריסה) -> New deployment (פריסה חדשה).
 * 5. ב-Select type בחר: Web app (אפליקציית אינטרנט).
 * 6. ב-Who has access בחר: Anyone (כל אחד).
 * 7. לחץ Deploy, אשר הרשאות, והעתק את ה-Web app URL שקיבלת.
 * 8. הדבק את ה-URL בתוך האפליקציה באייפון תחת הכפתור "ענן וגישה מרחוק" בראש המסך!
 */

const SPREADSHEET_ID = '1vOXP9dMe7jbzeNbkMxR_8c3LdLlHKtxoapanhWDfs-Y';

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    if (body.endpoint === '/api/weight') {
      const sheet = ss.getSheetByName('מעקב משקל יומי');
      const data = sheet.getDataRange().getDisplayValues();
      const targetDate = body.date; // DD/MM/YYYY
      let foundRow = -1;

      for (let i = 2; i < data.length; i++) {
        if (data[i][0] && data[i][0].trim() === targetDate) {
          foundRow = i + 1;
          break;
        }
      }

      if (foundRow > 0) {
        sheet.getRange(foundRow, 2).setValue(body.time || '');
        sheet.getRange(foundRow, 3).setValue(body.weight);
        if (body.note !== undefined) {
          sheet.getRange(foundRow, 5).setValue(body.note);
        }
      } else {
        sheet.appendRow([targetDate, body.time || '', body.weight, '', body.note || '']);
      }
    }

    if (body.endpoint === '/api/workout') {
      const sheet = ss.getSheetByName('תכנית אימון 19/7');
      const rowIdx = parseInt(String(body.id).replace('ex-', ''), 10);
      if (rowIdx > 1) {
        sheet.getRange(rowIdx, 4).setValue(body.currentWeight);
      }
    }

    return ContentService.createTextOutput(JSON.stringify({ ok: true, synced: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
