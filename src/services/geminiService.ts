import { MnemonicResponse, Language } from "../types";

async function callServer(payload: object): Promise<{ text?: string; candidates?: any[] }> {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Server error ${res.status}`);
  }
  return res.json();
}

export class GeminiService {
  async checkSpelling(word: string): Promise<string> {
    const data = await callServer({
      model: "gemini-2.5-flash",
      contents: `Correct the spelling of the English word: "${word}". Return ONLY the corrected word, no punctuation or explanation.`,
      config: { thinkingConfig: { thinkingBudget: 0 } }
    });
    const corrected = data.text?.trim().toLowerCase().replace(/[^a-z\s-]/g, '');
    return corrected || word.toLowerCase();
  }

  async getMnemonic(word: string, targetLanguage: Language): Promise<MnemonicResponse> {
    const data = await callServer({
      model: "gemini-2.5-flash",
      contents: `Generate a mnemonic for the English word "${word}" for a ${targetLanguage} speaker.`,
      config: {
        responseMimeType: "application/json",
        systemInstruction: `You are a Linguistic Mnemonic Architect using the Keyword Method. All explanatory fields MUST be in ${targetLanguage}. Return ONLY valid JSON with: word, transcription, meaning, morphology, imagination, phoneticLink, connectorSentence, examples (array of strings), synonyms (array of strings), level, category, imagePrompt.`
      }
    });
    if (!data.text) throw new Error("Empty response from AI");
    return JSON.parse(data.text);
  }

  async generateImage(prompt: string): Promise<string> {
    const data = await callServer({
      model: "gemini-2.0-flash-preview-image-generation",
      contents: { parts: [{ text: `${prompt}. High-fidelity, cinematic lighting, no text, no labels, 4k.` }] },
      config: { responseModalities: ["IMAGE"] }
    });
    const parts = data.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.data) {
        return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
      }
    }
    return '';
  }

  async generateTTS(text: string, targetLanguage: Language): Promise<string> {
    const data = await callServer({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Read aloud. English words in English accent, ${targetLanguage} parts in natural ${targetLanguage} accent. Text: "${text}"` }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } } }
      }
    });
    const parts = data.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData?.data) return part.inlineData.data;
    }
    return '';
  }

  async getPracticeResponse(word: string, meaning: string, targetLanguage: Language, history: any[], level?: string, sentenceCount: number = 0) {
    const data = await callServer({
      model: "gemini-2.5-flash",
      contents: history.length > 0 ? history : [{
        role: 'user',
        parts: [{ text: `Hi! I want to practice "${word}". Level: ${level || 'Easy'}. Start in ${targetLanguage}.` }]
      }],
      config: {
        responseMimeType: "application/json",
        systemInstruction: `English Practice Partner. Help practice "${word}" (meaning: ${meaning}) at ${level || 'Easy'} level. Communicate in ${targetLanguage}. After 5 correct sentences set sessionComplete true. Return ONLY valid JSON: { feedback: string, isCorrect: boolean, sessionComplete: boolean }`
      }
    });
    return data.text;
  }

  async generateNuance(word: string, synonyms: string[], targetLanguage: Language): Promise<any> {
    const data = await callServer({
      model: "gemini-2.5-flash",
      contents: `Explain nuance differences between "${word}" and synonyms: ${synonyms.join(', ')} for a ${targetLanguage} speaker.`,
      config: {
        responseMimeType: "application/json",
        systemInstruction: `Expert English coach. Explain in ${targetLanguage}. Return ONLY valid JSON: { coreDifference: string, comparisonTable: [{word, usage, reason}], commonMistake: {incorrect, natural} }`
      }
    });
    if (!data.text) throw new Error("Empty nuance response");
    return JSON.parse(data.text);
  }
}
