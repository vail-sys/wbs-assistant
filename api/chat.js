const { google } = require('googleapis');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const { history } = req.body;

  if (!apiKey || !clientEmail || !privateKey) {
    return res.status(500).json({ error: 'Server misconfiguration: Missing API or Google Credentials' });
  }

  try {
    const auth = new google.auth.JWT(
      clientEmail,
      null,
      privateKey,
      ['https://www.googleapis.com/auth/spreadsheets.readonly']
    );

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = '1KNzVv_g25Pa_as6cCyQGYOx7FxLSxpxBj9RN0Gadhkw';
    
    // 1. Get all the tab names in your spreadsheet dynamically
    const sheetMeta = await sheets.spreadsheets.get({ spreadsheetId });
    const ranges = sheetMeta.data.sheets.map(s => `'${s.properties.title}'!A:Z`);

    // 2. Fetch data from ALL tabs at the exact same time
    const response = await sheets.spreadsheets.values.batchGet({
      spreadsheetId,
      ranges,
    });

    // 3. Combine all the tabs into one giant database for the AI
    let allData = [];
    response.data.valueRanges.forEach(sheet => {
      const rows = sheet.values;
      if (rows && rows.length > 0) {
        const headers = rows[0];
        const sheetData = rows.slice(1).map(row => {
          let rowData = {};
          headers.forEach((header, index) => {
            rowData[header] = row[index] || ""; 
          });
          // Tag each row with its source tab so the AI knows where it came from
          rowData["Source Tab"] = sheet.range.split('!')[0].replace(/'/g, ''); 
          return rowData;
        });
        allData = allData.concat(sheetData);
      }
    });

    // 4. The Restored Brain: Glossary and Rules included
    const SYSTEM_PROMPT = `You are a Work Packaging training assistant for a 400–700 MW data center construction program. You help users learn the program's AWP work breakdown structure.

## ID Structure
- EN and PR packages: AREA-PHASEnn-UF.MF (no zone — covers all zones)
- CO and CX packages: AREA-PHASEnn-ZONE-UF.MF (zone-specific work)
- Examples: DCH-EN01-D30.23 · DCH-PR01-D30.23 · DCH-CO01-Z1-D30.23 · DCH-CX01-Z1-D30.23

## Phase Types (IMPORTANT: THESE ARE ALL VALID WORK PACKAGES)
- EWP: Engineering Work Package (4 gates per system)
- PWP: Procurement Work Package (Procurement designation, contract vehicle, PO holder)
- CWP: Construction Work Package (Per zone per system)
- CXP: Commissioning Work Package (Per zone per system)

## Areas
SDT (Site Development) · SHL (Shell) · SST (Site Substation) · EYD (Electrical Yard) · MYD (Mechanical Yard) · DCH (Data Center Hall) · FSA (Facility Support Area) · SEC (Site Security)

## Rules
- Treat PWPs, CWPs, CXPs, and EWPs all equally as "Work Packages". Never refuse to answer about them.
- Reference specific WP IDs when relevant.
- For training questions, explain the WHY not just the WHAT.
- Use the knowledge base data below to give precise, data-backed answers.

## Complete Live WBS Knowledge Base:
${JSON.stringify(allData)}`;

    const aiResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: history,
        generationConfig: { maxOutputTokens: 1500 }
      })
    });

    const aiData = await aiResponse.json();

    if (aiData.error) {
      return res.status(500).json({ error: aiData.error.message });
    }

    const text = aiData.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I could not generate a response. Please try again.';
    return res.status(200).json({ text });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Server crashed while trying to read the Google Sheet.' });
  }
};
