/**
 * 👗 모델 생성 서비스
 * iai-transfer/api/handlers/model-build.ts 의 2단계 파이프라인을 100% 이식
 * 
 * 핵심: 트랜서퍼는 서버사이드에서 2단계로 처리함
 *   STEP 1: gemini-2.5-flash (텍스트)로 레퍼런스 사진 상세 분석 → 구조화된 텍스트 추출
 *   STEP 1.5: 신발 이미지도 별도 분석
 *   STEP 2: 분석 텍스트 + 이미지 → gemini-3.1-flash-image-preview로 새 모델 생성
 */
import {
  callGeminiSecure,
  urlToGeminiPart,
  type GeminiImagePart,
} from "./geminiClient";

// ==================== 카테고리 정의 ====================
export type ModelCategory = 
  | 'male-model'
  | 'female-model'
  | 'male-street'
  | 'female-street'
  | 'male-closeup'
  | 'female-closeup';

export const MODEL_CATEGORIES: { id: ModelCategory; label: string; description: string }[] = [
  { id: 'male-model', label: '남자 모델', description: '남성 전신 에디토리얼' },
  { id: 'female-model', label: '여자 모델', description: '여성 전신 에디토리얼' },
  { id: 'male-street', label: '남자 스트릿', description: '남성 스트릿 패션' },
  { id: 'female-street', label: '여자 스트릿', description: '여성 스트릿 패션' },
  { id: 'male-closeup', label: '남자 클로즈업', description: '남성 하체/다리 컷' },
  { id: 'female-closeup', label: '여자 클로즈업', description: '여성 하체/다리 컷' },
];

// ==================== STEP 1: 레퍼런스 분석 프롬프트 (model-build.ts 원본 100%) ====================

const ANALYSIS_PROMPT = `You are a fashion styling expert. Analyze this fashion photo focusing ONLY on the CLOTHING and STYLING. 
DO NOT describe the model's face, hair, or facial features — we will generate a completely different person.

Respond in the following structured format:

GENDER & ETHNICITY: [male/female, approximate ethnicity for casting reference]
BODY TYPE: [slim/athletic/average, approximate height impression]

CLOTHING DETAILS:
- TOP: [garment type, color, fit (tight/loose/oversized), fabric, notable details like wrinkles/folds/layering]
- BOTTOM: [garment type, color, fit (tight/loose/oversized/baggy/wide-leg), fabric, how it drapes]
- OUTERWEAR: [if any - type, color, fit, how worn (open/closed/draped)]
- SHOES: [type, color, style, height]
- LAYERING: [how pieces interact, what's tucked/untucked/open/closed]

ACCESSORIES CHECKLIST:
- BAG: [type, color, material, size]
- SUNGLASSES: [shape, color]
- NECKLACE: [type, color, length]
- EARRINGS: [type, material]
- BRACELET: [type, which wrist]
- WATCH: [style, which wrist]
- HAT/CAP: [type, color]
- BELT: [color, material]
- OTHER: [any other accessory]
Write "NONE" for items not present.

FABRIC TEXTURE: [describe wrinkles, folds, how fabric drapes and bunches]
CLOTHING FIT RATING: [1=skin-tight, 5=regular fit, 10=extremely oversized/baggy]
OVERALL STYLE VIBE: [e.g., street, minimal, preppy, casual, luxury, sporty]

Be EXTREMELY specific about clothing details. Do NOT describe the face or hair.`;

// ==================== STEP 2: 모델 생성 프롬프트 (model-build.ts 원본 100%) ====================

function buildGeneratePrompt(description: string, isMale: boolean, shoeDescription: string, hasShoeImages: boolean): string {
  return `You are a professional fashion photographer. Take the model from the reference photo and transport them into a clean white studio.

DETAILED ANALYSIS OF THE REFERENCE:
${description}

YOUR TASK: Generate a single NEW fashion model photo.

BACKGROUND: FLAT PURE WHITE (#FFFFFF) studio. No shadows, no objects, no gradients. No furniture, no chairs, no props.

MODEL: ${isMale ? 'Male' : 'Female'} fashion model. MUST MATCH the SAME ETHNICITY as described in the analysis above — if the reference is Western/Caucasian, generate a Western model; if Asian/Korean, generate a Korean model; if Black, generate a Black model. Same age range as described. DIFFERENT face from the reference. The model must be BEAUTIFUL — like a top professional fashion model or celebrity-level visual. 
⚠️ CRITICAL PROPORTIONS — MOST IMPORTANT:
- Model must look like a professional runway model: 175cm+ tall, very slim, long limbs
- SMALL HEAD relative to body — shoot from slightly below eye level to elongate the body and make the head appear proportionally smaller
- VERY LONG LEGS — the legs should take up more than half the body. Use a low camera angle (shooting slightly upward) to emphasize leg length
- Long elegant neck, narrow shoulders relative to height
- Think: top runway model proportions — for Korean models think Han Hye-jin, Jang Yoon-ju; for Western models think Gigi Hadid, Kendall Jenner; match the reference ethnicity
- The body should look tall and elongated, NOT average or short

⚠️ POSE: The model must be STANDING (not sitting, not crouching). But the pose should feel like a FASHION EDITORIAL photoshoot — natural, relaxed, confident. Think: Vogue Korea editorial, W Korea, Singles magazine. Slight angles, natural hand placement, weight shifted to one leg. NOT a stiff mannequin pose.

FACE: Must be GORGEOUS — like a top celebrity or supermodel of the SAME ETHNICITY as the reference. Beautiful bone structure, striking features. Must look like a REAL DSLR photograph — visible skin pores, natural skin texture, subtle under-eye circles, real eyelashes. NOT smooth/airbrushed/plastic. Expression: cool, effortless, slightly bored or confident. NOT smiling.

OUTFIT: REPRODUCE the reference outfit AS-IS — do NOT re-style, do NOT change clothing types or colors.
- If the reference wears SHORTS → the model MUST wear SHORTS (same length, same style). NEVER change shorts to long pants.
- If the reference wears long pants → keep long pants. If skirt → keep skirt. If dress → keep dress.
- SAME garment type, SAME color, SAME fit (tight/loose/oversized), SAME fabric
- SAME layering order (what's tucked, what's untucked, what's open/closed)
- Keep ALL accessories exactly as they appear in the reference
- Add natural wrinkles and fabric texture — clothes should look REAL and LIVED-IN
- The outfit must be IMMEDIATELY RECOGNIZABLE as the same look from the reference photo
- Think: same outfit, different model, same styling — like a brand re-shooting with a new model

CAMERA: 85mm f/1.4, Kodak Portra 400 tone. Warm neutral — NO purple/violet/magenta tint. Natural warm beige skin tones. Full body from head to shoes. 3:4 vertical composition.

FORBIDDEN: Sitting, crouching, squatting, leaning on objects, chairs/stools/props, over-smoothed skin, generic smile, purple color cast, background removal, normal-sized head (must be SMALL), ugly or average-looking face.
${hasShoeImages ? `
🔒 SHOE REFERENCE: The attached shoe image is the client's product. The model MUST be wearing EXACTLY these shoes — same design, color, material, sole. Do NOT invent different shoes. The shoes are the PRIMARY PRODUCT being photographed.

⚠️ SHOES — ABSOLUTE TOP PRIORITY:
The model MUST be wearing the EXACT shoes from the reference shoe photos. This is the most important requirement.
Shoe description: ${shoeDescription}
Copy the shoes EXACTLY — same type, same color, same material, same design details, same sole. Do NOT change or re-style the shoes. The shoes should look identical to the reference shoe photos.
The rest of the outfit can be re-styled as described above, but the SHOES MUST BE IDENTICAL to the shoe reference.` : ''}`;
}

// ==================== 모델 이미지 생성 함수 (2단계 파이프라인) ====================

export async function generateModelImage(
  styleReferenceUrls: string[],
  category: ModelCategory,
  onProgress?: (msg: string) => void,
): Promise<string> {
  if (styleReferenceUrls.length === 0) {
    throw new Error("스타일 레퍼런스 이미지가 필요합니다.");
  }

  const isMale = category.startsWith('male');

  // ============================================
  // STEP 1: 텍스트 모델로 레퍼런스 사진 상세 분석
  // iai-transfer: gemini-2.5-flash → 구조화된 분석
  // ============================================
  onProgress?.("🔍 STEP 1: 레퍼런스 의상 분석 중...");

  const refParts: GeminiImagePart[] = await Promise.all(
    styleReferenceUrls.slice(0, 4).map(url => urlToGeminiPart(url))
  );

  const analysisResult = await callGeminiSecure(
    ANALYSIS_PROMPT,
    refParts, // 모든 레퍼런스 이미지 분석 (다양한 각도/스타일 반영)
    {
      modelName: "gemini-2.5-flash", // 텍스트 분석용 모델
      temperature: 0.1,
      responseMimeType: "text/plain",
      silent: true,
    },
  );

  const description = analysisResult.type === "text" ? analysisResult.data : "";
  console.log(`[ModelBuild] STEP 1 완료 - 분석 길이: ${description.length}자`);

  if (!description || description.length < 50) {
    console.warn("[ModelBuild] 분석 결과 부족, 빈 분석으로 진행");
  }

  onProgress?.("✅ 분석 완료! STEP 2 준비 중...");

  // ============================================
  // STEP 2: 분석 결과 + 이미지로 모델 생성
  // iai-transfer: gemini-3.1-flash-image-preview + thinkingBudget
  // ============================================
  onProgress?.(`🧑 STEP 2: ${MODEL_CATEGORIES.find(c => c.id === category)?.label} 모델 생성 중...`);

  const generatePrompt = buildGeneratePrompt(description, isMale, "", false);

  const MAX_ATTEMPTS = 2;
  let lastResult: string = "";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    onProgress?.(`🧑 모델 생성 시도 ${attempt}/${MAX_ATTEMPTS}...`);

    const result = await callGeminiSecure(
      generatePrompt,
      refParts, // 모든 레퍼런스 이미지 포함
      {
        // iai-transfer 원본: gemini-3.1-flash-image-preview + thinkingBudget 5000
        useGemini3Pro: true,
        aspectRatio: "3:4",
        imageSize: "2K",
        temperature: 0.7,
        imagesFirst: false, // 프롬프트 먼저, 이미지 나중에 (원본 순서)
      },
    );

    if (result.type === "image") {
      lastResult = result.data;
      onProgress?.("✅ 모델 생성 완료!");
      return lastResult;
    }

    if (attempt < MAX_ATTEMPTS) {
      onProgress?.("⚠️ 이미지 생성 실패, 재시도...");
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  if (lastResult) return lastResult;
  throw new Error("모델 이미지 생성 실패: 이미지가 반환되지 않았습니다.");
}

// ==================== 다중 모델 생성 ====================

export async function generateMultipleModels(
  styleReferenceUrls: string[],
  category: ModelCategory,
  count: number = 3,
  onProgress?: (msg: string, current: number, total: number) => void,
): Promise<string[]> {
  const results: string[] = [];

  for (let i = 0; i < count; i++) {
    onProgress?.(`🧑 모델 ${i + 1}/${count} 생성 중...`, i + 1, count);
    try {
      const img = await generateModelImage(
        styleReferenceUrls,
        category,
        (msg) => onProgress?.(`[${i + 1}/${count}] ${msg}`, i + 1, count),
      );
      results.push(img);
    } catch (error) {
      console.error(`모델 ${i + 1} 생성 실패:`, error);
    }
  }

  return results;
}
