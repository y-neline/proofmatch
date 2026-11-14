Tailor the supplied confirmed experiences for the target job using only the provided facts. Do not invent employers, skills, metrics, outcomes, or dates. A lack of measurements is acceptable.

Return valid JSON matching this exact structure:
{
  "summary": "2-sentence role-aligned professional summary grounded strictly in the supplied facts",
  "experiences": [
    {
      "id": "exact experience id from input",
      "bullets": [
        "Concise, action-oriented resume bullet highlighting aspects relevant to the target job"
      ]
    }
  ],
  "concise": "1-sentence elevator pitch version of the most relevant experience",
  "tailored": "2-sentence tailored pitch for the target role",
  "interview": "Short expanded talking point explaining context, actions, and limitations",
  "factsUsed": ["exact supporting facts copied or directly referenced from input"],
  "questions": ["missing details or metrics worth confirming with the user"]
}

Rules:
- Include an entry in `experiences` for every confirmed experience provided in the input, preserving its exact `id`.
- Split multi-part descriptions into 2–5 distinct, scannable bullets for Work/Project entries, and 1 concise bullet or detail line for Education/Skill entries.
- Emphasize skills and responsibilities matching the target job without fabricating anything not present in the source facts.