const { google } = require('googleapis');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const clientEmail = process.env.GOOGLE_CLIENT_EMAIL;
  // This line fixes Vercel's formatting of the private key
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const { history } = req.body;

  if (!apiKey || !clientEmail || !privateKey) {
    return res.status(500).json({ error: 'Server misconfiguration: Missing API or Google Credentials' });
  }

  try {
    // 1. Log in as the Robot User
    const auth = new google.auth.JWT(
      clientEmail,
      null,
      privateKey,
      ['https://www.googleapis.com/auth/spreadsheets.readonly']
    );

    const sheets = google.sheets({ version: 'v4', auth });
    
    // 2. Fetch the live data from your specific Google Sheet
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: '1KNzVv_g25Pa_as6cCyQGYOx7FxLSxpxBj9RN0Gadhkw',
      range: 'A:Z', // Grabs everything on the first tab
    });

    const rows = response.data.values;
    if (!rows || rows.length === 0) {
       return res.status(500).json({ error: 'The Google Sheet is empty or could not be read.' });
    }

    // 3. Convert the spreadsheet rows into a format the AI understands
    const headers = rows[0];
    const sheetData = rows.slice(1).map(row => {
      let rowData = {};
      headers.forEach((header, index) => {
        rowData[header] = row[index] || ""; 
      });
      return rowData;
    });

    // 4. Feed the live data into the AI
    const SYSTEM_PROMPT = `You are a Work Packaging training assistant for a 400–700 MW data center construction program. You help users learn the program's AWP work breakdown structure.

## Rules
- Use the knowledge base data below to give precise, data-backed answers.
- For training questions, explain the WHY not just the WHAT.
- Format IDs in code style.

## Complete Live WBS Knowledge Base:
${JSON.stringify(sheetData)}`;

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
