const WBS_DATA = require('./data.json');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const { history } = req.body;

  if (!apiKey) {
    return res.status(500).json({ error: 'Server misconfiguration: Missing API Key' });
  }

  // COMPRESSION: Strip out massive text paragraphs to prevent the Google server from choking
  const compressedData = WBS_DATA.EWPs ? WBS_DATA.EWPs.map(pkg => {
    const { "Scope Description": _, "Key Deliverables": __, ...essentialData } = pkg;
    return essentialData;
  }) : WBS_DATA;

  const SYSTEM_PROMPT = `You are a Work Packaging training assistant for a 400–700 MW data center construction program. You help users learn the program's AWP work breakdown structure.

## ID Structure
- EN and PR packages: AREA-PHASEnn-UF.MF (no zone — covers all zones)
- CO and CX packages: AREA-PHASEnn-ZONE-UF.MF (zone-specific work)
- Examples: DCH-EN01-D30.23 · DCH-PR01-D30.23 · DCH-CO01-Z1-D30.23 · DCH-CX01-Z1-D30.23

## Scope Family Key
Format: AREA-UF.MF (e.g. DCH-D30.23). Appears as column A on every tab. Filter by this key to get the complete lifecycle for any scope — all EWPs, the PWP, all CWPs, and all CXPs.

## Phase Types
- EWP: 4 gates per system — 30% SD, 60% DD, 90% CD, IFC. Program AE owns 30/60%; Local AE owns 90/IFC.
- PWP: 1 per scope family. Procurement designation, contract vehicle, PO holder, long-lead flag.
- CWP: Per zone per system. PoC sequence, est. duration, IWP count, constraint categories.
- CXP: Per zone per system. PFC → FPT → IST → Owner Accept per zone, then campus FIST.

## Procurement Designations
- CFCI: Contractor Furnished, Contractor Installed — standard subcontract
- OFCI: Owner Furnished, Contractor Installed — owner holds PO for major equipment (generators, transformers, chillers, UPS, switchgear, racks). Long-lead.
- OFOI: Owner Furnished, Owner Installed — owner procures and installs (IT equipment, DCIM, security systems)

## Areas
SDT (Site Development) · SHL (Shell) · SST (Site Substation) · EYD (Electrical Yard) · MYD (Mechanical Yard) · DCH (Data Center Hall) · FSA (Facility Support Area) · SEC (Site Security)

## Zones
Z0 = campus-wide (all EN and PR packages). Z1–Z4 = per data hall zone (CO and CX packages).

## Long-Lead Items (52–78 week lead times)
SST transformers and MV switchgear · EYD generators · EYD LV switchgear · MYD chillers · DCH UPS and racks · DCH cooling units · FSA BMS platform · DCH DCIM platform

## Response style
- Reference specific WP IDs (e.g. DCH-CO01-Z1-D30.23) when relevant
- For training questions, explain the WHY not just the WHAT
- Use the knowledge base data below to give precise, data-backed answers
- Format IDs in code style
- Keep answers educational and clear

## Complete WBS Knowledge Base (Summary):
${JSON.stringify(compressedData)}`;

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${apiKey}`, {
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
};
