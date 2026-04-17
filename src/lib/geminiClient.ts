/**
 * Gemini API Client - Shoe Studio
 * autopage-v2/src/lib/geminiClient.ts에서 핵심 로직 100% 복사
 * 제거: 서버 프록시, 크레딧, Vercel 압축, 사용량 추적
 * 유지: API 호출, 모델 선택, 이미지 처리 로직 전부 동일
 */
import { GoogleGenAI } from "@google/genai";

// ==================== API 키 (하드코딩) ====================
const API_KEY_STORAGE_KEY = "shoe-studio-gemini-api-key";
const ENV_API_KEY = (import.meta.env.VITE_GEMINI_API_KEY || "").trim();

// 🔑 백업 API 키 (메인 키 실패 시 자동 전환) — 트랜서퍼 동일
const FALLBACK_API_KEY = "";

export function getStoredApiKey(): string {
  if (typeof window !== "undefined") {
    const stored = window.localStorage.getItem(API_KEY_STORAGE_KEY)?.trim();
    if (stored) return stored;
  }
  return ENV_API_KEY;
}

export function setStoredApiKey(key: string) {
  if (typeof window === "undefined") return;
  const trimmed = key.trim();
  if (!trimmed) return;
  window.localStorage.setItem(API_KEY_STORAGE_KEY, trimmed);
}

export function clearStoredApiKey() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(API_KEY_STORAGE_KEY);
}

// ==================== 타입 정의 (트랜서퍼 동일) ====================
export interface GeminiImagePart {
  data: string;
  mimeType: string;
}

export interface GeminiPart {
  text?: string;
  inlineData?: {
    data: string;
    mimeType: string;
  };
}

export interface GeminiConfig {
  aspectRatio?: string;
  imageSize?: string;
  temperature?: number;
  responseMimeType?: string;
  useGemini3Pro?: boolean;
  modelName?: string;
  safetySettings?: { category: string; threshold: string }[];
  imageLabels?: string[];
  imagesFirst?: boolean;
  silent?: boolean;
  [key: string]: unknown;
}

export interface GeminiResponse {
  type: "image" | "text";
  data: string;
}

export interface GenerationConfig {
  temperature?: number;
  safetySettings?: { category: string; threshold: string }[];
  responseModalities?: string[];
  responseMimeType?: string;
  [key: string]: unknown;
}

// ==================== 시스템 프롬프트 (트랜서퍼 동일) ====================
export const GEMINI_PRO_IMAGE_SYSTEM_PROMPT = `You are an expert fashion photography editor specializing in shoe product images.

## YOUR MISSION
Execute the structured editing instructions with SURGICAL PRECISION. Your edits must be so seamless that the result looks like an original photograph, not an AI-generated image.

## ABSOLUTE PRESERVATION RULES
1. SHOES - 100% IDENTICAL (every pixel, stitch, lace hole)
2. MODEL IDENTITY - SAME PERSON ALWAYS (face, skin tone, proportions)
3. UNREQUESTED ELEMENTS - DO NOT TOUCH

## TECHNICAL REQUIREMENTS
- Maintain original image resolution and aspect ratio
- Preserve original image quality (no blur, no noise)
- Ensure color consistency with original photography style
- Maintain professional fashion photography aesthetics`;

// ==================== 유틸리티 (트랜서퍼 동일) ====================
export function extractBase64(dataUrl: string): GeminiImagePart {
  if (dataUrl.includes("base64,")) {
    const [prefix, data] = dataUrl.split("base64,");
    const mimeMatch = prefix.match(/data:([^;]+)/);
    return { data, mimeType: mimeMatch ? mimeMatch[1] : "image/png" };
  }
  return { data: dataUrl, mimeType: "image/png" };
}

/**
 * 🔧 Gemini 지원 aspectRatio 중 입력 이미지 비율에 가장 가까운 비율 선택
 * (트랜서퍼 geminiClient.ts 277-300행 동일)
 */
const SUPPORTED_ASPECT_RATIOS = [
  { name: "21:9", value: 21 / 9 },  // 2.33 (울트라와이드)
  { name: "16:9", value: 16 / 9 },  // 1.78 (HD)
  { name: "3:2", value: 3 / 2 },    // 1.5  (DSLR)
  { name: "4:3", value: 4 / 3 },    // 1.33 (SD)
  { name: "5:4", value: 5 / 4 },    // 1.25 (거의 정사각형 가로)
  { name: "1:1", value: 1 },        // 1.0  (정사각형)
  { name: "4:5", value: 4 / 5 },    // 0.8  (인스타그램)
  { name: "3:4", value: 3 / 4 },    // 0.75 (세로 일반)
  { name: "2:3", value: 2 / 3 },    // 0.67 (세로 DSLR)
  { name: "9:16", value: 9 / 16 },  // 0.56 (세로 HD/릴스)
];

export function findClosestAspectRatio(width: number, height: number): string {
  const ratio = width / height;
  const closest = SUPPORTED_ASPECT_RATIOS.reduce((prev, curr) =>
    Math.abs(curr.value - ratio) < Math.abs(prev.value - ratio) ? curr : prev,
  );
  console.log(
    `📐 이미지 비율 ${ratio.toFixed(2)} → 지원 비율 ${closest.name} 선택`,
  );
  return closest.name;
}

// ==================== URL → Gemini Part 변환 (트랜서퍼 동일) ====================
export async function urlToGeminiPart(url: string): Promise<GeminiImagePart> {
  if (url.startsWith("data:")) {
    const mimeType = url.split(";")[0].split(":")[1];
    const data = url.includes("base64,") ? url.split("base64,")[1] : url;
    return { data, mimeType };
  }

  if (url.startsWith("blob:")) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Blob URL expired: ${url.substring(0, 50)}`);
      const blob = await response.blob();
      const mimeType = blob.type || "image/png";
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          const data = result.includes("base64,") ? result.split("base64,")[1] : result;
          resolve({ data, mimeType });
        };
        reader.onerror = () => reject(new Error("Failed to read blob"));
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error("❌ Blob URL 처리 실패:", error);
      throw new Error("이미지를 불러올 수 없습니다. 다시 업로드해주세요.");
    }
  }

  // 일반 URL 처리
  const response = await fetch(url);
  const blob = await response.blob();
  const mimeType = blob.type || "image/png";
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const data = result.includes("base64,") ? result.split("base64,")[1] : result;
      resolve({ data, mimeType });
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ==================== 이미지 비율 감지 (트랜서퍼 동일) ====================
export async function getImageAspectFromDataUrl(url: string): Promise<{
  aspectRatio: string;
  orientation: "portrait" | "landscape" | "square";
  promptRatio: string;
  width: number;
  height: number;
  ratio: number;
}> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const { width, height } = img;
      const ratio = width / height;
      const aspectRatio = findClosestAspectRatio(width, height);
      const orientation = ratio > 1.05 ? "landscape" : ratio < 0.95 ? "portrait" : "square";
      const promptRatio =
        orientation === "portrait"
          ? `PORTRAIT (Vertical, taller than wide, approximately ${aspectRatio} ratio)`
          : orientation === "landscape"
            ? `LANDSCAPE (Horizontal, wider than tall, approximately ${aspectRatio} ratio)`
            : `SQUARE (1:1 ratio)`;
      resolve({ aspectRatio, orientation, promptRatio, width, height, ratio });
    };
    img.onerror = () => reject(new Error("이미지 로드 실패"));
    img.src = url.startsWith("data:") ? url : url;
  });
}

// ==================== 핵심 Gemini API 호출 (트랜서퍼 executeGeminiRequest 100% 복사) ====================
export async function callGeminiSecure(
  prompt: string,
  images: GeminiImagePart[] = [],
  config?: GeminiConfig,
  _systemInstruction?: string,
): Promise<GeminiResponse> {
  const apiKey = getStoredApiKey();
  if (!apiKey) {
    throw new Error("Gemini API 키가 설정되지 않았습니다.");
  }

  // 🔑 폴백용: try 밖에서 캡처 (catch에서 백업 키 재시도 시 사용)
  let _fbModelName = '';
  let _fbParts: GeminiPart[] = [];
  let _fbGenConfig: Record<string, any> = {};

  try {
    const genAI = new GoogleGenAI({
      apiKey,
      httpOptions: { timeout: 180_000 }, // 🔥 3분 타임아웃 (이미지 생성은 오래 걸림)
    });

    // 이미지 파트 구성 (🔥 AI 스튜디오 방식: 레이블 추가)
    const parts: GeminiPart[] = [];

    // 🔥 imagesFirst 옵션: 이미지를 텍스트보다 먼저 배치 (신발 합성 등)
    if (config?.imagesFirst && images.length > 0) {
      const labels = config?.imageLabels || [];
      for (let i = 0; i < images.length; i++) {
        const img = images[i];
        if (labels[i]) {
          parts.push({ text: labels[i] });
        }
        parts.push({
          inlineData: {
            data: img.data,
            mimeType: img.mimeType,
          },
        });
      }
      // 프롬프트는 이미지 뒤에
      parts.push({ text: prompt });
    } else {
      // 기본: 프롬프트 먼저 추가 (AI 스튜디오 방식)
      parts.push({ text: prompt });

      if (images.length > 0) {
        const labels = config?.imageLabels || [];
        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          if (labels[i]) {
            parts.push({ text: labels[i] });
          }
          parts.push({
            inlineData: {
              data: img.data,
              mimeType: img.mimeType,
            },
          });
        }
      }
    }

    // 모델 설정 (트랜서퍼 geminiClient.ts 600-618행 100% 동일)
    // gemini-3-flash-preview: 텍스트 전용 (빠름, Gemini 3 Flash)
    // gemini-3.1-flash-image-preview: 모든 이미지 생성 (Nano Banana 2)
    const MODEL_TEXT = "gemini-3-flash-preview";
    const MODEL_IMAGE = "gemini-3.1-flash-image-preview"; // Nano Banana 2
    const MODEL_BEAUTIFY = "gemini-3.1-flash-image-preview"; // 미화 전용 (Nano Banana 2)

    const isImageGenRequest =
      config?.aspectRatio || config?.imageSize || images.length > 0;

    // useGemini3Pro=true 면 MODEL_BEAUTIFY, 아니면 일반 이미지 모델
    // 🔴 Config에 modelName이 있으면 최우선 적용
    const modelName = config?.modelName
      ? config.modelName
      : !isImageGenRequest
        ? MODEL_TEXT
        : config?.useGemini3Pro
          ? MODEL_BEAUTIFY
          : MODEL_IMAGE;

    console.log(
      `🤖 모델 선택: ${modelName}, config.modelName: ${config?.modelName}, 이미지 포함: ${images.length}장`,
    );

    // 🔧 텍스트 전용 모델 리스트 (이 모델들은 이미지 생성 불가)
    const TEXT_ONLY_MODELS = [
      "gemini-3-flash-preview",
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-1.5-flash",
      "gemini-pro",
    ];
    const isTextOnlyModel = TEXT_ONLY_MODELS.some(
      (m) => modelName.includes(m) && !modelName.includes("image"),
    );

    // 이미지 생성 요청 시 config 설정
    const genConfig: GenerationConfig = {};
    if (isImageGenRequest && !isTextOnlyModel) {
      // 🔧 AI 스튜디오와 동일: IMAGE 전용 응답 모드 (더 정확한 이미지 생성)
      genConfig.responseModalities = ["Image"];

      // 🔥 이미지 해상도 및 비율 설정 (Gemini API 공식 문서 형식)
      if (config?.imageSize || config?.aspectRatio) {
        (genConfig as any).imageConfig = {
          ...(config?.aspectRatio && { aspectRatio: config.aspectRatio }),
          ...(config?.imageSize && { imageSize: config.imageSize }),
        };
        console.log(
          `📐 이미지 설정: imageConfig = { aspectRatio: '${config?.aspectRatio}', imageSize: '${config?.imageSize}' }`,
        );
      }
    }
    if (config?.temperature) {
      genConfig.temperature = config.temperature;
    }
    if (config?.safetySettings) {
      genConfig.safetySettings = config.safetySettings;
    }
    // 🔧 JSON 응답 모드 지원 (의류 분석 등)
    if (config?.responseMimeType) {
      genConfig.responseMimeType = config.responseMimeType;
      // JSON 모드에서는 IMAGE 응답 모드 제거
      delete genConfig.responseModalities;
    }

    // 🔑 폴백용 캡처
    _fbModelName = modelName;
    _fbParts = parts;
    _fbGenConfig = genConfig;

    const response = await genAI.models.generateContent({
      model: modelName,
      contents: { parts },
      config:
        Object.keys(genConfig).length > 0 ? (genConfig as any) : undefined,
    });

    // 응답 추출 (이미지 우선 탐색)
    let textData = "";
    for (const candidate of response.candidates || []) {
      for (const part of candidate.content?.parts || []) {
        if (part.inlineData) {
          // 이미지가 발견되면 즉시 반환
          return {
            type: "image",
            data: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
          };
        } else if (part.text) {
          // 텍스트는 모아둠
          textData += part.text;
        }
      }
    }

    // 이미지가 없고 텍스트만 있다면 텍스트 반환
    if (textData) {
      return { type: "text", data: textData };
    }
    return { type: "text", data: "응답을 생성할 수 없습니다." };
  } catch (error: unknown) {
    const rawMsg = error instanceof Error ? error.message : "Gemini API 오류";
    const isKeyError = rawMsg.includes('401') || rawMsg.includes('403') || rawMsg.includes('429')
      || rawMsg.includes('UNAUTHENTICATED') || rawMsg.includes('PERMISSION_DENIED')
      || rawMsg.includes('RESOURCE_EXHAUSTED') || rawMsg.includes('quota');

    // 🔑 메인 키 실패 시 백업 키로 자동 재시도 (1회만) — 트랜서퍼 동일
    if (isKeyError && FALLBACK_API_KEY && apiKey !== FALLBACK_API_KEY) {
      console.warn(`⚠️ 메인 키 실패 (${rawMsg.slice(0, 60)}), 백업 키로 재시도...`);
      try {
        const fallbackGenAI = new GoogleGenAI({
          apiKey: FALLBACK_API_KEY,
          httpOptions: { timeout: 180_000 },
        });
        const fallbackResponse = await fallbackGenAI.models.generateContent({
          model: _fbModelName,
          contents: { parts: _fbParts },
          config: Object.keys(_fbGenConfig).length > 0 ? (_fbGenConfig as any) : undefined,
        });

        for (const candidate of fallbackResponse.candidates || []) {
          for (const fbPart of candidate.content?.parts || []) {
            if (fbPart.inlineData) {
              return {
                type: "image",
                data: `data:${fbPart.inlineData.mimeType};base64,${fbPart.inlineData.data}`,
              };
            } else if (fbPart.text) {
              return { type: "text", data: fbPart.text };
            }
          }
        }
        return { type: "text", data: "응답을 생성할 수 없습니다." };
      } catch (fallbackErr) {
        console.error("❌ 백업 키도 실패:", fallbackErr);
      }
    }

    console.error("❌ Gemini API 오류:", error);

    // HTTP 상태코드별 한국어 안내 메시지 생성 (트랜서퍼 동일)
    const getUserMessage = (msg: string): string => {
      if (msg.includes('401') || msg.includes('UNAUTHENTICATED') || msg.includes('invalid_api_key')) {
        return 'API 키가 잘못되었습니다.';
      }
      if (msg.includes('403') || msg.includes('PERMISSION_DENIED')) {
        return 'API 키 권한이 부족합니다.';
      }
      if (msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('quota')) {
        return '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.';
      }
      if (msg.includes('500') || msg.includes('INTERNAL')) {
        return 'Gemini 서버에 일시적인 문제가 있습니다. 1~2분 후 다시 시도해주세요.';
      }
      if (msg.includes('503') || msg.includes('UNAVAILABLE')) {
        return 'Gemini 서버가 일시적으로 응답하지 않습니다.';
      }
      if (msg.includes('AbortError') || msg.includes('aborted') || msg.includes('timeout')) {
        return '요청 시간이 초과되었습니다. 잠시 후 다시 시도해주세요.';
      }
      if (msg.includes('SAFETY') || msg.includes('safety') || msg.includes('blocked')) {
        return '안전 필터에 의해 차단되었습니다. 다른 이미지로 시도해주세요.';
      }
      return msg;
    };

    throw new Error(getUserMessage(rawMsg));
  }
}
