/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI, Modality } from "@google/genai";

// Ambil API key dari localStorage (kalau sudah disimpan)
let savedKey = localStorage.getItem("titan_api_key") || "";
let ai: GoogleGenAI | null = savedKey ? new GoogleGenAI({ apiKey: savedKey }) : null;

// Ambil elemen input API key & tombol simpan
const apiKeyInput = document.getElementById("api-key-input") as HTMLInputElement;
const saveKeyButton = document.getElementById("save-api-key") as HTMLButtonElement;

if (saveKeyButton && apiKeyInput) {
  apiKeyInput.value = savedKey;
  saveKeyButton.addEventListener("click", () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
      alert("Masukkan API key dulu!");
      return;
    }
    localStorage.setItem("titan_api_key", key);
    ai = new GoogleGenAI({ apiKey: key });
    alert("API key berhasil disimpan di browser kamu ✅");
  });
}

// Get references to all the input elements and the container
const promptInput = document.getElementById('prompt-input') as HTMLInputElement;
const referencePhotoInput = document.getElementById('reference-photo-input') as HTMLInputElement;
const aspectRatioSelect = document.getElementById('aspect-ratio-select') as HTMLSelectElement;
const styleSelect = document.getElementById('style-select') as HTMLSelectElement;
const qualitySelect = document.getElementById('quality-select') as HTMLSelectElement;
const generateButton = document.getElementById('generate-button') as HTMLButtonElement;
const contentContainer = document.getElementById('content-container');

// Ensure all elements exist
if (!promptInput || !referencePhotoInput || !aspectRatioSelect || !styleSelect || !qualitySelect || !generateButton || !contentContainer) {
  throw new Error('Could not find one or more required UI elements.');
}

// Helper function to convert a file to a base64 string
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // remove the "data:image/jpeg;base64," part
      resolve(result.split(',')[1]);
    };
    reader.onerror = (error) => reject(error);
  });
}

function fileToGenerativePart(file: File): Promise<{ inlineData: { data: string, mimeType: string } }> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const result = reader.result as string;
            resolve({
                inlineData: {
                    data: result.split(',')[1],
                    mimeType: file.type,
                }
            });
        };
        reader.onerror = (error) => reject(error);
    });
}


// Add a click event listener to the generate button
generateButton.addEventListener('click', async () => {
    if (!ai) {
    contentContainer.innerHTML = `<div class="error"><p>Masukkan API key kamu dulu sebelum generate gambar.</p></div>`;
    return;
  }

  const prompt = promptInput.value;
  if (!prompt) {
    contentContainer.innerHTML = `<div class="error"><p>Harap masukkan prompt deskripsi gambar.</p></div>`;
    return;
  }

  // Show loading indicator
  contentContainer.innerHTML = `
    <div class="loading">
      <div class="loader"></div>
      <p>Gambar sedang dibuat, mohon tunggu...</p>
    </div>
  `;
  generateButton.disabled = true;

  try {
    const photoFile = referencePhotoInput.files?.[0];
    const style = styleSelect.value;
    const quality = qualitySelect.value;
    
    // Construct a more descriptive prompt for the AI
    const fullPrompt = `${prompt}, in a ${style} style, with ${quality} quality.`;

    let imageUrl: string;

    if (photoFile) {
      // Scenario 1: Image editing/generation with a reference photo
      const imagePart = await fileToGenerativePart(photoFile);
      const textPart = { text: fullPrompt };
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: { parts: [imagePart, textPart] },
        config: {
          responseModalities: [Modality.IMAGE, Modality.TEXT],
        },
      });
      
      const imagePartResponse = response.candidates?.[0]?.content?.parts?.find(part => part.inlineData);
      if (!imagePartResponse?.inlineData) {
        throw new Error('API tidak mengembalikan gambar. Coba prompt yang berbeda.');
      }
      const base64ImageBytes = imagePartResponse.inlineData.data;
      imageUrl = `data:${imagePartResponse.inlineData.mimeType};base64,${base64ImageBytes}`;

    } else {
      // Scenario 2: Text-to-image generation
      const aspectRatio = aspectRatioSelect.value as "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
      const response = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: fullPrompt,
        config: {
          numberOfImages: 1,
          outputMimeType: 'image/png',
          aspectRatio: aspectRatio,
        },
      });

      if (!response.generatedImages?.[0]?.image?.imageBytes) {
        throw new Error('API tidak mengembalikan gambar. Coba prompt yang berbeda.');
      }
      const base64ImageBytes = response.generatedImages[0].image.imageBytes;
      imageUrl = `data:image/png;base64,${base64ImageBytes}`;
    }

    // Display the generated image and action buttons
    contentContainer.innerHTML = `
      <div class="generated-image-container">
        <img src="${imageUrl}" alt="Generated Image by TITAN AI">
        <div class="button-group">
          <a href="${imageUrl}" download="titan-ai-generated-image.png" class="download-button">Download Gambar</a>
          <button id="delete-button" class="delete-button">Hapus</button>
        </div>
      </div>
    `;

    // Add event listener for the new delete button
    const deleteButton = document.getElementById('delete-button');
    if (deleteButton) {
      deleteButton.addEventListener('click', () => {
        contentContainer.innerHTML = '';
      });
    }

  } catch (error) {
    console.error(error);
    contentContainer.innerHTML = `<div class="error"><p>Maaf, terjadi kesalahan saat membuat gambar. Silakan coba lagi.</p><p class="error-details">${error.message}</p></div>`;
  } finally {
    generateButton.disabled = false;
  }
});
