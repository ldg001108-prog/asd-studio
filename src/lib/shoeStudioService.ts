/**
 * Shoe Studio 합성 서비스 (Standalone)
 * autopage-v2에서 핵심 합성 파이프라인 전체 이식
 */
import {
  callGeminiSecure,
  urlToGeminiPart,
  findClosestAspectRatio,
  type GeminiImagePart,
} from "./geminiClient";

export type StudioEffect = "minimal" | "natural" | "texture" | "cinematic" | "gravity";

const MUSINSA_THUMB_WIDTH = 1500;
const MUSINSA_THUMB_HEIGHT = 2000;
const MUSINSA_THUMB_ASPECT_RATIO = "3:4";

// ==================== 이미지 비율 분석 ====================
const getImageAspectFromDataUrl = (
  dataUrl: string,
): Promise<{
  aspectRatio: string;
  orientation: "portrait" | "square" | "landscape";
  promptRatio: string;
  width: number;
  height: number;
  ratio: number;
}> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const width = img.width;
      const height = img.height;
      const ratio = width / height;
      const aspectRatio = findClosestAspectRatio(width, height);
      let orientation: "portrait" | "square" | "landscape";
      let promptRatio: string;
      if (ratio < 0.9) {
        orientation = "portrait";
        promptRatio = `PORTRAIT (Vertical, ${aspectRatio} ratio)`;
      } else if (ratio > 1.1) {
        orientation = "landscape";
        promptRatio = `LANDSCAPE (Horizontal, ${aspectRatio} ratio)`;
      } else {
        orientation = "square";
        promptRatio = `SQUARE (${aspectRatio} ratio)`;
      }
      resolve({ aspectRatio, orientation, promptRatio, width, height, ratio });
    };
    img.onerror = () => reject(new Error("Failed to load image for aspect analysis"));
    img.src = dataUrl;
  });
};

// ==================== 리사이즈 ====================
const forceResizeToExactDimensions = (
  generatedImageDataUrl: string,
  targetWidth: number,
  targetHeight: number,
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const srcWidth = img.width;
      const srcHeight = img.height;
      const scale = Math.min(targetWidth / srcWidth, targetHeight / srcHeight);
      const resizedWidth = Math.round(srcWidth * scale);
      const resizedHeight = Math.round(srcHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("No canvas context")); return; }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, targetWidth, targetHeight);
      const offsetX = Math.round((targetWidth - resizedWidth) / 2);
      const offsetY = Math.round((targetHeight - resizedHeight) / 2);
      ctx.drawImage(img, offsetX, offsetY, resizedWidth, resizedHeight);
      resolve(canvas.toDataURL("image/jpeg", 0.95));
    };
    img.onerror = () => reject(new Error("Failed to load image for resizing"));
    img.src = generatedImageDataUrl;
  });
};

const normalizeToMusinsaThumb = (dataUrl: string): Promise<string> =>
  forceResizeToExactDimensions(dataUrl, MUSINSA_THUMB_WIDTH, MUSINSA_THUMB_HEIGHT);

// ==================== 신발 분석 캐시 ====================
const shoeAnalysisCache = new Map<string, ShoeAnalysis>();

interface ShoeAnalysis {
  shoeType: string;
  outsoleShape: string;
  outsoleColor: string;
  outsolePattern: string;
  outsoleMaterial: string;
  outsoleThickness: string;
  upperMaterial: string;
  upperFinish: string;
  upperColor: string;
  upperPattern: string;
  stitchingPattern: string;
  panelDivisions: string;
  lacingStyle: string;
}

// ==================== STEP 1: 신발 분석 ====================
async function analyzeShoeFeatures(
  shoeParts: GeminiImagePart[],
): Promise<ShoeAnalysis> {
  const cacheKey = shoeParts.map(p => p.data.slice(-60)).join('|');
  const cached = shoeAnalysisCache.get(cacheKey);
  if (cached) {
    console.log("[analyzeShoeFeatures] ✅ 캐시 히트!");
    return cached;
  }

  console.log("[analyzeShoeFeatures] 📊 Analyzing shoe features...");
  const prompt = `Analyze these shoe product images thoroughly.
Return JSON only:
{
  "shoeType": "sneaker/boot/derby/sandal/heel/loafer/etc",
  "outsoleShape": "chunky/slim/platform/wedge/flat",
  "outsoleColor": "color",
  "outsolePattern": "wavy/grid/smooth/etc",
  "outsoleMaterial": "rubber/foam/leather/etc",
  "outsoleThickness": "thin/medium/thick",
  "upperMaterial": "leather/suede/mesh/canvas",
  "upperFinish": "shiny/matte/cracked/patent",
  "upperColor": "color(s)",
  "upperPattern": "pattern or texture",
  "stitchingPattern": "stitch details or none",
  "panelDivisions": "panel layout",
  "lacingStyle": "lacing type or none"
}
Be precise - this is used to replicate the exact shoe.`;

  try {
    const result = await callGeminiSecure(prompt, shoeParts, {
      modelName: "gemini-3-flash-preview",
      temperature: 0.1,
      silent: true,
    });
    if (result.type === "text" && result.data) {
      const jsonMatch = result.data.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const analysis = JSON.parse(jsonMatch[0]) as ShoeAnalysis;
        shoeAnalysisCache.set(cacheKey, analysis);
        return analysis;
      }
    }
  } catch (e) {
    console.warn("[analyzeShoeFeatures] Analysis failed, using defaults");
  }

  return {
    shoeType: "sneaker", outsoleShape: "standard", outsoleColor: "black",
    outsolePattern: "standard tread", outsoleMaterial: "rubber", outsoleThickness: "medium",
    upperMaterial: "leather", upperFinish: "matte", upperColor: "black",
    upperPattern: "none", stitchingPattern: "standard stitching",
    panelDivisions: "standard panels", lacingStyle: "standard lacing",
  };
}

// ==================== STEP 2: 검증 ====================
interface VerificationResult {
  pass: boolean;
  confidence: number;
  issues: string[];
}

async function verifyShoeMatch(
  resultImage: GeminiImagePart,
  referenceParts: GeminiImagePart[],
  expectedAnalysis: ShoeAnalysis,
): Promise<VerificationResult> {
  console.log("[verifyShoeMatch] Verifying generated result...");
  const prompt = `Compare the LAST image (generated result) with the FIRST images (reference shoes).
Expected shoe features:
- Type: ${expectedAnalysis.shoeType}
- Outsole: ${expectedAnalysis.outsoleShape} shape, ${expectedAnalysis.outsoleColor} color, ${expectedAnalysis.outsolePattern} pattern
- Upper: ${expectedAnalysis.upperMaterial} (${expectedAnalysis.upperFinish})
- Stitching: ${expectedAnalysis.stitchingPattern}

Check if the shoes in the result match the reference shoes.
Return ONLY valid JSON (no markdown):
{ "pass": true/false, "confidence": 0.0-1.0, "issues": ["issue1"] or [] }

STRICT: The reference shoes are the ONLY correct shoes.`;

  try {
    const allImages = [...referenceParts, resultImage];
    const result = await callGeminiSecure(prompt, allImages, {
      modelName: "gemini-3-flash-preview",
      silent: true,
    });
    if (result.type === "text" && result.data) {
      const jsonMatch = result.data.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as VerificationResult;
      }
    }
  } catch (e) {
    console.warn("[verifyShoeMatch] Verification failed, assuming pass");
  }
  return { pass: true, confidence: 0.5, issues: [] };
}

// ==================== 신발 각도 분석 및 최적 3장 선별 ====================
interface ShoeAngleAnalysis {
  index: number;
  angle: "FRONT" | "SIDE" | "BACK" | "OUTSOLE" | "THREE_QUARTER" | "OTHER";
}

async function analyzeAndSelectBestShoeImages(
  shoeParts: GeminiImagePart[],
): Promise<GeminiImagePart[]> {
  if (shoeParts.length <= 3) return shoeParts;

  console.log(`[analyzeAndSelectBestShoeImages] 📊 ${shoeParts.length}장 → 최적 3장 선별`);
  const prompt = `Analyze these ${shoeParts.length} shoe product images and identify the camera angle for each.
For EACH image (1 to ${shoeParts.length}), classify as: FRONT/SIDE/BACK/OUTSOLE/THREE_QUARTER/OTHER
Return JSON only: { "analysis": [{ "index": 1, "angle": "FRONT" }, ...] }`;

  try {
    const result = await callGeminiSecure(prompt, shoeParts, {
      modelName: "gemini-2.5-flash",
      temperature: 0.1,
      silent: true,
    });
    if (result.type === "text" && result.data) {
      const jsonMatch = result.data.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const { analysis } = JSON.parse(jsonMatch[0]) as { analysis: ShoeAngleAnalysis[] };
        const priority: ShoeAngleAnalysis["angle"][] = ["FRONT", "SIDE", "THREE_QUARTER", "BACK", "OTHER"];
        const selected: number[] = [];
        const usedAngles = new Set<string>();
        for (const angle of priority) {
          if (selected.length >= 3) break;
          const item = analysis.find(a => a.angle === angle && !usedAngles.has(a.angle));
          if (item) { selected.push(item.index - 1); usedAngles.add(item.angle); }
        }
        if (selected.length < 3) {
          for (const item of analysis) {
            if (selected.length >= 3) break;
            if (!selected.includes(item.index - 1)) selected.push(item.index - 1);
          }
        }
        return selected.map(i => shoeParts[i]).filter(Boolean);
      }
    }
  } catch (e) {
    console.warn("[analyzeAndSelectBestShoeImages] 분석 실패, 균등 샘플링 폴백");
  }

  const step = (shoeParts.length - 1) / 2;
  return [shoeParts[0], shoeParts[Math.round(step)], shoeParts[shoeParts.length - 1]];
}

// ==================== 메인 합성 함수 ====================
export async function synthesizeShoeStudio(
  shoeImageUrls: string | string[],
  modelImageUrl: string,
  _effect: StudioEffect = "minimal",
  useProModel: boolean = false,
  _resolution: "1K" | "2K" | "4K" = "2K",
  onProgress?: (msg: string) => void,
): Promise<string> {
  const shoeUrls = Array.isArray(shoeImageUrls) ? shoeImageUrls : [shoeImageUrls];
  const MAX_REFERENCE_IMAGES = useProModel ? 4 : 3;
  let shoeParts: GeminiImagePart[] = [];

  onProgress?.("🔍 상품 이미지 변환 중...");

  if (!useProModel && shoeUrls.length > MAX_REFERENCE_IMAGES) {
    const allShoeParts = await Promise.all(shoeUrls.slice(0, 8).map(url => urlToGeminiPart(url)));
    shoeParts = await analyzeAndSelectBestShoeImages(allShoeParts);
  } else {
    console.log(`[synthesizeShoeStudio] ${useProModel ? "🔥 Pro Mode (4장)" : "⚡ Fast Mode"}: ${Math.min(shoeUrls.length, MAX_REFERENCE_IMAGES)}장 변환`);
    shoeParts = await Promise.all(shoeUrls.slice(0, MAX_REFERENCE_IMAGES).map(url => urlToGeminiPart(url)));
  }

  onProgress?.("🧑 모델 이미지 분석 중...");

  const [modelPart, aspectInfo] = await Promise.all([
    urlToGeminiPart(modelImageUrl),
    getImageAspectFromDataUrl(modelImageUrl).catch(() => ({
      aspectRatio: "3:4", orientation: "portrait" as const,
      promptRatio: "PORTRAIT (Vertical, approximately 3:4 ratio)",
      width: 0, height: 0, ratio: 0.75,
    })),
  ]);

  console.log(`[synthesizeShoeStudio] 🎯 모델 이미지: ${modelImageUrl.substring(0, 80)}`);
  console.log(`[synthesizeShoeStudio] Aspect: ${aspectInfo.orientation} (${aspectInfo.width}x${aspectInfo.height})`);

  onProgress?.("📊 상품 분석 중...");
  const shoeAnalysis = await analyzeShoeFeatures(shoeParts);
  console.log("[synthesizeShoeStudio] Analysis:", shoeAnalysis);

  const imageCount = shoeParts.length;
  const prompt = `Using the provided shoe reference images (Images 1 through ${imageCount}) and the target model photo (the last image), replace ONLY the shoes the model is wearing with the exact shoes shown in the reference images.

Study the reference shoes carefully and reproduce every detail precisely: the outsole shape, color, and tread pattern; the upper material texture and finish; all stitching lines, logos, and design elements; and the lacing style with all hardware. The shoes must be an exact visual match to the reference.

The model must remain completely unchanged — preserve the same face, hair, body shape, skin tone, pose, and clothing with the exact same colors and patterns. The background and environment must stay identical, including all lighting, shadows, and color temperature.

Before compositing, analyze the model's anatomy carefully. Count the visible legs and replace only the corresponding number of shoes — if two legs are visible, replace two shoes; if one leg is visible, replace only one. Never generate extra limbs or duplicate the person.

If the feet area appears masked, transparent, or erased, fully reconstruct the feet and ankles using the reference shoes. Fill any empty space seamlessly with no transparency or white gaps, inferring the correct ankle position from the leg angle.

Scale the new shoes proportionally to the model's feet and match the perspective of the original pose. Ensure seamless blending where the pant leg meets the shoe, with natural shadows underneath. The shoes should be the sharpest element in the image.

CRITICAL: Output must follow a Musinsa-style thumbnail standard. Use a fixed ${MUSINSA_THUMB_ASPECT_RATIO} portrait composition and frame the subject cleanly for e-commerce browsing.

Output a single photorealistic image at ${MUSINSA_THUMB_WIDTH}x${MUSINSA_THUMB_HEIGHT} pixels with ${MUSINSA_THUMB_ASPECT_RATIO} aspect ratio. Do not create collages, side-by-side comparisons, or duplicates. Do not apply any filters such as soft focus, HDR, or film grain.

⚠️ ABSOLUTE RULE — SHOE IDENTITY LOCK:
The ONLY correct shoes are the ones shown in the reference images (Images 1 through ${imageCount}). These reference shoes are the SOLE SOURCE OF TRUTH.
- Whatever shoes the model is currently wearing are WRONG — they must be COMPLETELY removed and replaced with the reference shoes.
- ANY shoe that does not EXACTLY match the reference images is considered a DEFECT, regardless of how similar it may look.
- Do NOT preserve, blend, adapt, or be influenced by ANY footwear from the original model image.
- The reference shoe's exact design, colorway, branding, sole pattern, material texture, and silhouette must appear in the output — no approximations allowed.
- If even ONE detail of the output shoe differs from the reference (wrong logo, wrong sole color, wrong stitching), the result is INVALID.
- Treat this as a product certification task: only the registered reference shoe passes inspection.`;

  const MAX_ATTEMPTS = 2;
  let generatedImageDataUrl = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    onProgress?.(`🎨 합성 중... (시도 ${attempt}/${MAX_ATTEMPTS})`);
    console.log(`[synthesizeShoeStudio] 🎨 Attempt ${attempt}/${MAX_ATTEMPTS}`);

    const result = await callGeminiSecure(
      prompt,
      [...shoeParts, modelPart],
      {
        useGemini3Pro: useProModel,
        aspectRatio: MUSINSA_THUMB_ASPECT_RATIO,
        imageSize: "2K",
        temperature: 0.7,
        imagesFirst: true,
      },
    );

    if (result.type !== "image") {
      console.error("[synthesizeShoeStudio] Synthesis failed. Result:", result);
      if (attempt === MAX_ATTEMPTS) throw new Error("신발 합성 실패 (이미지 반환 안됨)");
      continue;
    }

    generatedImageDataUrl = result.data;

    if (attempt < MAX_ATTEMPTS) {
      onProgress?.("✅ 검증 중...");
      const resultPart = {
        data: result.data.split("base64,")[1] || result.data,
        mimeType: "image/png",
      };
      const verification = await verifyShoeMatch(resultPart, shoeParts, shoeAnalysis);
      if (verification.pass || verification.confidence >= 0.7) {
        console.log(`[synthesizeShoeStudio] ✅ Verification PASSED (${verification.confidence})`);
        break;
      } else {
        console.warn(`[synthesizeShoeStudio] ⚠️ Verification FAILED: ${verification.issues.join(", ")}`);
        onProgress?.("⚠️ 검증 실패, 재생성 중...");
      }
    }
  }

  onProgress?.("📐 최종 리사이즈 중...");
  try {
    const resizedImage = await normalizeToMusinsaThumb(generatedImageDataUrl);
    console.log(`[synthesizeShoeStudio] ✓ HARD LOCKED to ${MUSINSA_THUMB_WIDTH}x${MUSINSA_THUMB_HEIGHT}`);
    return resizedImage;
  } catch (resizeError) {
    console.warn("[synthesizeShoeStudio] Resize failed, returning original:", resizeError);
    return generatedImageDataUrl;
  }
}
