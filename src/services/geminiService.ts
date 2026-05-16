import { Type, Modality, ThinkingLevel } from "@google/genai";
import { MnemonicResponse, Language } from "../types";

async function callServer(payload: object): Promise<{ text?: string; candidates?: any[] }> {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const error = Object.assign(new Error(err.error || `Server error ${res.status}`), {
      status: res.status,
    });
    // Dispatch so App.tsx can show the toast without prop drilling
    window.dispatchEvent(new CustomEvent('mnemonix:error', { detail: error }));
    throw error;
  }
  return res.json();
}

/**
 * Helper to retry a function if it returns a falsy value or throws
 */
async function withRetry<T>(fn: () => Promise<T | null>, maxRetries = 2): Promise<T> {
  let lastError: any;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      const result = await fn();
      if (result) return result;
      if (i < maxRetries) console.warn(`Attempt ${i + 1} failed (returned null/empty), retrying...`);
    } catch (error) {
      lastError = error;
      if (i < maxRetries) console.warn(`Attempt ${i + 1} threw error, retrying...`, error);
      else throw error;
    }
    // Small delay between retries
    if (i < maxRetries) await new Promise(r => setTimeout(r, 1000));
  }
  throw lastError || new Error("Operation failed after retries");
}

export class GeminiService {
  /**
   * Corrects the spelling of a word using AI. 
   * Returns the original word if no correction is needed.
   */
  async checkSpelling(word: string): Promise<string> {
    try {
      const data = await callServer({
        model: "gemini-3-flash-preview",
        contents: `Correct the spelling of the following English word: "${word}". 
        Return ONLY the corrected word. If the word is already correct, return it as is. 
        Do not include any punctuation or explanations.`,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }
        }
      });

      const corrected = data.text?.trim().toLowerCase().replace(/[^a-z\s-]/g, '');
      return corrected || word.toLowerCase();
    } catch (error) {
      console.warn("Spelling check failed, using original word:", error);
      return word.toLowerCase();
    }
  }

  /**
   * Generates a complete mnemonic object (meaning, acoustic link, imagery link)
   * in the user's native language using the Keyword Method.
   */
  async getMnemonic(word: string, targetLanguage: Language): Promise<MnemonicResponse> {
    return withRetry(async () => {
      const payload = {
        model: "gemini-3-flash-preview",
        contents: `Generate a mnemonic for the English word "${word}" for a ${targetLanguage} speaker.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              word: { type: Type.STRING },
              transcription: { type: Type.STRING },
              meaning: { type: Type.STRING },
              morphology: { type: Type.STRING },
              imagination: { type: Type.STRING },
              phoneticLink: { type: Type.STRING },
              connectorSentence: { type: Type.STRING },
              examples: { 
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "2-3 English sentences with their ${targetLanguage} translations"
              },
              synonyms: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: "3-5 English synonyms followed by their ${targetLanguage} translations in parentheses"
              },
              level: { 
                  type: Type.STRING, 
                  description: "CEFR level of the word (Beginner, Pre-Intermediate, Intermediate, Advanced)" 
              },
              category: { 
                  type: Type.STRING, 
                  description: "One of the top 20 categories: Crime, Technology, Medicine, Education, Environment, Economy, Travel, Food, Sports, Art, Science, Law, Business, Health, History, Politics, Media, Nature, People, Daily Life." 
              },
              imagePrompt: { type: Type.STRING, description: "Detailed visual description for an image generation AI" }
            },
            required: ["word", "transcription", "meaning", "morphology", "imagination", "phoneticLink", "connectorSentence", "examples", "synonyms", "level", "category", "imagePrompt"]
          },
          systemInstruction: `Role: You are a Linguistic Mnemonic Architect specializing in the "Keyword Method" established by Raugh and Atkinson at Stanford University. Your goal is to help users acquire English vocabulary by building a two-stage mnemonic chain consisting of an acoustic link and an imagery link.

Instructions for Content Generation:
1. The Acoustic Link (phoneticLink)
- Identify a "Keyword" in ${targetLanguage} that sounds as much as possible like a part of the spoken English word.
- Priority: Favor the initial syllable or the most stressed part of the English word for better retrieval.
- Constraint: The keyword must be a concrete noun or an easily visualized object/phrase. Avoid abstract concepts.

2. The Imagery Link (imagination)
- Create a vivid mental image description where the Keyword and the English Translation interact in a graphic, dynamic, and memorable way.
- Absurdity Factor: The interaction should be unique, absurd, or exaggerated.
- Fusion: The scene must be a single "fused" picture where the two items are locked together.

3. Covert Cognate Check
- Before forcing a keyword, check if a "covert cognate" exists (a word with a shared root in ${targetLanguage}).
- If a cognate is found, prioritize explaining that relationship first in the phoneticLink field.

4. Audio & Phonetic Guidance
- Provide the IPA transcription for the English word.

5. Visual Generation Prompt (imagePrompt)
- Write a detailed, high-fidelity image generation prompt.
- Specify a scene that visually integrates the Native Keyword and the English Meaning in a single, high-contrast, and memorable artistic style (naturalistic or traditional based on ${targetLanguage} culture).

CRITICAL RULES:
1. All explanatory fields (meaning, morphology, imagination, phoneticLink, connectorSentence) MUST be written EXCLUSIVELY in ${targetLanguage}.
2. The "word" field should remain the original English word.
3. Return ONLY a valid JSON object.`
        },
      };

      const data = await callServer(payload);
      if (!data.text) return null;
      
      const parsed = JSON.parse(data.text) as MnemonicResponse;
      // Validate critical fields existence to ensure "full outcome"
      const requiredFields: (keyof MnemonicResponse)[] = ["meaning", "phoneticLink", "imagination", "imagePrompt"];
      for (const field of requiredFields) {
        if (!parsed[field] || parsed[field] === "...") return null;
      }
      
      return parsed;
    });
  }

  /**
   * Generates a high-fidelity image based on the mnemonic's visual prompt.
   * Returns a base64 encoded image string.
   */
  async generateImage(prompt: string): Promise<string> {
    return withRetry(async () => {
      const data = await callServer({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [{ text: `${prompt}. High-fidelity, high-contrast, cinematic lighting, no text, no labels, 4k resolution.` }],
        },
        config: {
          imageConfig: {
            aspectRatio: "1:1",
            imageSize: "1K"
          }
        },
      });

      const parts = data.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData?.data) {
          return `data:${part.inlineData.mimeType || 'image/png'};base64,${part.inlineData.data}`;
        }
      }
      return null; // Return null to trigger retry helper
    });
  }

  /**
   * Converts mnemonic text to speech using a bilingual voice model.
   * Handles English words and native language explanations in one stream.
   */
  async generateTTS(text: string, targetLanguage: Language): Promise<string> {
    return withRetry(async () => {
      const data = await callServer({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ 
          parts: [{ 
            text: `Read the following text aloud. It contains English words and their explanation in ${targetLanguage}. 
            Please use a clear, standard English accent for the English words and a natural, fluent ${targetLanguage} accent for the rest of the text.
            Text: "${text}"` 
          }] 
        }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
          },
        },
      });

      const parts = data.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.inlineData?.data) {
          return part.inlineData.data;
        }
      }
      return null;
    });
  }

  async getPracticeResponse(word: string, meaning: string, targetLanguage: Language, history: any[], level?: 'Easy' | 'Medium' | 'Hard' | 'EasyToHard', sentenceCount: number = 0) {
    const levelInstructions = {
      Easy: "Focus on SIMPLE sentences (Subject + Verb + Object). Use high-frequency, basic vocabulary. Example structure: 'The cat sits on the mat.'",
      Medium: "Focus on COMPOUND sentences using 'and,' 'but,' or 'or.' Encourage the use of common adverbs. Example structure: 'The cat sits on the mat, but the dog is outside.'",
      Hard: "Focus on COMPLEX sentences with relative clauses, passive voice, or conditional tense. Example structure: 'Although it was raining, the cat remained on the mat that was placed near the fire.'",
      EasyToHard: `This is a progressive session. 
        - For sentences 1-2: Use EASY level (Simple sentences).
        - For sentences 3-4: Use MEDIUM level (Compound sentences).
        - For sentence 5: Use HARD level (Complex sentences).
        Current sentence number: ${sentenceCount + 1}.`
    };

    const selectedLevelInstruction = level ? (levelInstructions[level as keyof typeof levelInstructions] || levelInstructions.Easy) : levelInstructions.Easy;
    const displayLevel = level === 'EasyToHard' 
      ? (sentenceCount < 2 ? 'Easy' : sentenceCount < 4 ? 'Medium' : 'Hard')
      : (level || 'Easy');

    // If history is empty, we need an initial prompt to trigger the first greeting
      const contents = history.length > 0 ? history : [{
      role: 'user',
      parts: [{ text: `Hi! I want to practice the word "${word}". I've chosen the ${level === 'EasyToHard' ? 'Easy to Hard' : (level || 'Easy')} level. Please start the session in ${targetLanguage}.` }]
    }];

    const data = await callServer({
      model: "gemini-3-flash-preview",
      contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            feedback: { type: Type.STRING, description: "The AI's response to the user in the target language." },
            isCorrect: { type: Type.BOOLEAN, description: "Whether the user's English sentence was correct and met the level requirements." },
            sessionComplete: { type: Type.BOOLEAN, description: "Whether the 5-step practice session is now complete." }
          },
          required: ["feedback", "isCorrect", "sessionComplete"]
        },
        systemInstruction: `You are a helpful English Practice Partner. 
        The user is learning the word "${word}" (meaning: ${meaning}).
        Your goal is to help them practice using this word in context at the ${displayLevel} level.
        
        Level-Specific Sentence Requirements:
        ${selectedLevelInstruction}

        Instructions:
        1. Communicate EXCLUSIVELY in ${targetLanguage}. 
        2. Give the user a specific scenario or question in ${targetLanguage} that requires them to use the English word "${word}".
        3. The user MUST respond in English using the sentence structure appropriate for the ${displayLevel} level.
        4. Evaluate their English sentence. 
        5. If it's correct and matches the level's complexity, set isCorrect to true, provide praise in the feedback field, and give a new challenge.
        6. If it's incorrect or too simple for the level, set isCorrect to false, gently correct or guide them in the feedback field, and ask them to try again.
        7. This is a 5-step practice session. After 5 successful English sentences, set sessionComplete to true, congratulate them warmly in the feedback field, and tell them they have mastered the word!
        8. Keep your feedback concise (max 2-3 sentences).
        9. Return ONLY a valid JSON object.`,
      },
    });
    return data.text;
  }

  async generateNuance(word: string, synonyms: string[], targetLanguage: Language): Promise<any> {
    const synonymsList = synonyms && synonyms.length > 0 ? synonyms.join(', ') : 'common synonyms';
    const data = await callServer({
      model: "gemini-3-flash-preview",
      contents: `Explain the nuance and usage differences between the English word "${word}" and its synonyms: ${synonymsList}. Provide the explanation for a ${targetLanguage} speaker.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            coreDifference: { type: Type.STRING, description: "The main conceptual difference between the word and its synonyms in ${targetLanguage}." },
            comparisonTable: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  word: { type: Type.STRING },
                  usage: { type: Type.STRING, description: "A natural English sentence using this word." },
                  reason: { type: Type.STRING, description: "Why this word is used in this specific context (in ${targetLanguage})." }
                },
                required: ["word", "usage", "reason"]
              }
            },
            commonMistake: {
              type: Type.OBJECT,
              properties: {
                incorrect: { type: Type.STRING, description: "A common incorrect way a ${targetLanguage} speaker might use the word." },
                natural: { type: Type.STRING, description: "The correct, natural way to say it in English." }
              },
              required: ["incorrect", "natural"]
            }
          },
          required: ["coreDifference", "comparisonTable", "commonMistake"]
        },
        systemInstruction: `You are an expert English Language Coach. 
        Your goal is to help advanced learners understand the subtle differences (nuances) between similar words.
        
        Instructions:
        1. The "coreDifference" field must be written in ${targetLanguage}.
        2. The "comparisonTable" should show how the target word and its synonyms are used in different contexts. The "reason" field must be in ${targetLanguage}.
        3. The "commonMistake" section should highlight a typical error made by ${targetLanguage} speakers due to direct translation, and provide the natural English alternative.
        4. Keep explanations clear, professional, and practical.
        5. Return ONLY a valid JSON object.`
      }
    });

    const text = data.text;
    if (!text) throw new Error("Empty response from AI");
    return JSON.parse(text);
  }
}
