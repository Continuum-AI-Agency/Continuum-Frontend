# Prompt Enrichment API & Reference Injection Logic

This document outlines the architecture for the **Multimodal Prompt Enrichment System** and the **Dynamic Reference Injection** logic for the AI-Studio Canvas.

---

## 1. Prompt Enrichment API (SSE Contract)

The String Node acts as an "Intelligence Node" when inputs are connected. It requires an execution step where it streams the enriched prompt back to the frontend via Server-Sent Events (SSE).

### **Endpoint**
`POST /api/ai-studio/enrich`

### **Request Body**
```json
{
  "prompt": "A futuristic city...", // The user's typed prompt (optional base)
  "brandId": "user-brand-uuid",     // For brand voice/guideline injection
  "context": {
    "images": [
      {
        "type": "base64",
        "data": "data:image/png;base64,...",
        "mimeType": "image/png"
      }
    ],
    "audio": {
      "type": "base64",
      "data": "data:audio/mp3;base64,...", 
      "mimeType": "audio/mp3"
    },
    "documents": [
      {
        "name": "brand_guidelines.pdf",
        "content": "Full text content extracted from PDF..." 
      },
      {
        "name": "character_bio.txt",
        "content": "Character backstory..."
      }
    ]
  }
}
```

### **SSE Response Stream**
The backend streams the enriched text in chunks to allow for real-time UI updates in the String Node.

**Event: `message`**
```json
{ "delta": "Based on the " }
{ "delta": "audio context, " }
{ "delta": "the scene should be " }
{ "delta": "melancholic..." }
```

**Event: `done`**
```json
{ "fullText": "Based on the audio context, the scene should be melancholic..." }
```

**Event: `error`**
```json
{ "error": "Failed to process audio file." }
```

---

## 2. Image Reference Injection Logic (Client-Side)

This logic runs **before** the final payload is sent to the image/video generator (NanoGen/Veo). It injects context about specific reference types into the prompt.

### **Reference Types**
1.  **Default (Asset)**: Standard visual reference.
2.  **Product Ref**: "This is the product to feature."
3.  **Color/Theme Ref**: "Use this color palette/style."
4.  **Person Ref**: "This is the specific character/subject."

### **Injection Algorithm**

1.  **Ordering**: Reference images are ordered (0-indexed) based on their connection sequence to the generator node.
2.  **Numbering**: Each ref gets a user-invisible ID: `#1`, `#2`, `#3`, etc. (Index + 1).
3.  **Prompt Appending**: We append a structured context string to the end of the user's prompt.

### **Example Scenario**
*   **Prompt**: "A cinematic shot of a sneaker."
*   **Ref #1 (Default)**: General composition ref.
*   **Ref #2 (Product)**: The sneaker product image.
*   **Ref #3 (Color)**: A neon cyberpunk color palette image.
*   **Ref #4 (Person)**: A model wearing the sneaker.

### **Generated Injection String**
```text
[System Context Injection]
Ref. Image #2 is the primary Product to feature.
Ref. Image #3 provides the Color/Theme to generate in compliance with.
Ref. Image #4 is a Person/Character that must appear in the generation.
```

### **Final Prompt Payload Sent to Model**
```text
A cinematic shot of a sneaker. --ref_image_1 <data> --ref_image_2 <data> --ref_image_3 <data> --ref_image_4 <data> 

[System Context Injection]
Ref. Image #2 is the primary Product to feature.
Ref. Image #3 provides the Color/Theme to generate in compliance with.
Ref. Image #4 is a Person/Character that must appear in the generation.
```

*(Note: The actual implementation depends on whether the model supports text-based reference pointers or if this is purely for the "Enrich Prompt" step to understand context. For direct generation, this text guides the model's attention).*
