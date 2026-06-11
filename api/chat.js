module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const { history } = req.body;

  if (!apiKey) {
    return res.status(500).json({ error: 'Server misconfiguration: Missing API Key' });
  }

  // A shortened, safe version of your data so the server doesn't crash
  const WBS_DATA = {
    "EWPs": [
      {
        "Scope Family": "SDT-G10.31", 
        "WP ID": "SDT-EN01-G10.31", 
        "WP Name": "Earthwork & SWPPP engineering — 30%", 
        "Area": "SDT", 
        "Scope Description": "Schematic design (30%) for Earthwork & SWPPP engineering."
      }
    ]
  };

  const SYSTEM_PROMPT = `You are a Work Packaging training assistant for a 400–700 MW data center construction program. You help users learn the program's AWP work breakdown structure.

## Complete WBS Knowledge Base (Summary):
${JSON.stringify(WBS_DATA)}`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: history,
        generationConfig: { maxOutputTokens: 1500 }
      })
    });

    const data = await response.json();

    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || 'Sorry, I could not generate a response. Please try again.';
    
    return res.status(200).json({ text });

  } catch (error) {
    return res.status(500).json({ error: 'Failed to communicate with Gemini.' });
  }
}
