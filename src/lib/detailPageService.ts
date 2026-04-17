/**
 * 📄 네이버 스마트스토어 상세페이지 생성 서비스
 * 
 * 트랜서퍼(iai-transfer) fashionDesigner.ts 컷 구조 100% 이식
 * 
 * 컷 순서 (트랜서퍼 원본 13컷):
 *   🔹 1~4  상품 누끼 사진 4장 (업로드 원본)
 *   ① 5~7  모델 전신 착용 화보 3장 (AI)
 *   ② 8~10 같은 룩 허리 밑 착용 사진 3장 (AI)
 *   ③ 11~13 다른 룩 허리 밑 착용 사진 3장 (AI)
 *   ④ 스펙카드 (HTML)
 *   ⑤ 브랜드카드 (HTML)
 */
import { callGeminiSecure, urlToGeminiPart, type GeminiImagePart } from './geminiClient';

// ==================== 비율 ====================

const ASPECT_RATIO = '3:4';

// ==================== 컷 라벨 ====================

export const CUT_LABELS: Record<number, string> = {
  1: 'editorial_1',
  2: 'editorial_2',
  3: 'editorial_3',
  4: 'waist_same_1',
  5: 'waist_same_2',
  6: 'waist_same_3',
  7: 'waist_alt_1',
  8: 'waist_alt_2',
  9: 'waist_alt_3',
};

export const CUT_LABELS_KR: Record<number, string> = {
  1: '모델 화보 1',
  2: '모델 화보 2',
  3: '모델 화보 3',
  4: '허리 밑 착용 1',
  5: '허리 밑 착용 2',
  6: '허리 밑 착용 3',
  7: '허리밑 다른앵글 1',
  8: '허리밑 다른앵글 2',
  9: '허리밑 다른앵글 3',
};

// ==================== 모델 일관성 블록 (트랜서퍼 원본) ====================

function getModelConsistencyBlock(): string {
  return `
═══ MODEL & SCENE CONSISTENCY (CRITICAL — HIGHEST PRIORITY) ═══
You are given reference model photos. EVERY generated image MUST maintain:

[PERSON — IDENTICAL]
- SAME face shape, jawline, forehead, cheekbones
- SAME skin tone, complexion, blemishes
- SAME hair color, length, texture, style
- SAME body proportions, height, build
- SAME hands, fingers, nail style

[OUTFIT — IDENTICAL]
- SAME clothing as in the reference model photos (top, bottom, jacket, accessories)
- Do NOT change, add, or remove any clothing items
- SAME fabric color, texture, fit, and style
- Only the SHOES change — replace with the product shoe from reference

[BACKGROUND — IDENTICAL]
- SAME background/location as the reference model photos
- SAME lighting conditions, color temperature, mood
- SAME environment/set design — do NOT move the model to a different location
- If reference is studio → keep studio. If outdoor → keep same outdoor.

[ONLY CHANGES ALLOWED]
- Camera angle / framing / distance (the model's pose stays natural)
- The shoes on the model's feet (replaced with product)

The model must look like a REAL PERSON, not AI-generated.
If ANY element (face, outfit, background) differs from reference, the image is REJECTED.
═══════════════════════════════════════════════════════════════`;
}

// ==================== 신발 일관성 블록 ====================

function getShoeConsistencyBlock(productDesc: string): string {
  return `
═══ SHOE CONSISTENCY (CRITICAL) ═══
The shoe in EVERY image must be IDENTICAL to the reference product photos.
Product details: ${productDesc.slice(0, 500)}
Do NOT alter the shoe design, color, material, shape, or any detail.
The shoe must look exactly as photographed — same product identity is MANDATORY.
═══════════════════════════════════════`;
}

// ==================== 에디토리얼 스타일 블록 (트랜서퍼 fashionDesigner 원본) ====================

function getEditorialStyleBlock(): string {
  return `
═══ PHOTOGRAPHY STYLE (EDITORIAL — MUSINSA LEVEL) ═══
- ASPECT RATIO: 3:4 PORTRAIT (VERTICAL) — width < height. NEVER produce landscape.
- Shot on: Canon EOS R5 or Sony A7IV, 85mm f/1.8 prime lens
- Color grading: Warm matte film look (Kodak Portra 400 inspired)
- NO text overlays. NO graphics. NO banners. PURE photography only.
- NO AI artifacts: no plastic skin, no perfect symmetry, no floating objects
- Natural imperfections: slight fabric wrinkles, real hair movement, natural shadows
- Background: real locations (streets, cafes, parks, studios) — NOT plain white
- Lighting: natural daylight or soft studio lighting
- Mood: editorial fashion magazine, sophisticated but approachable
- Target: Korean fashion e-commerce — 20-35세 한국 소비자
═══════════════════════════════════════════════════════════════`;
}

// (다른 룩 블록 제거됨 — 선택된 모델의 원래 옷을 유지)

// ==================== 9컷 프롬프트 생성 ====================

function generateCutPrompts(productDescription: string): { cut: number; prompt: string; label: string; labelKr: string }[] {
  const modelBlock = getModelConsistencyBlock();
  const shoeBlock = getShoeConsistencyBlock(productDescription);
  const styleBlock = getEditorialStyleBlock();

  const commonHeader = `${modelBlock}\n\n${shoeBlock}\n\n${styleBlock}\n\nYou will receive reference photos: (1) product photos and (2) model reference photos.\nUse ALL references to maintain consistency.\n\n`;

  const prompts: { cut: number; prompt: string; label: string; labelKr: string }[] = [];

  // ── CUT 1~3: 모델 전신 착용 화보 ──

  prompts.push({
    cut: 1,
    label: CUT_LABELS[1],
    labelKr: CUT_LABELS_KR[1],
    prompt: `${commonHeader}
CUT 1: FULL-BODY SHOT 1
Photograph the model in full body, head to toe, wearing the product shoe.
- Camera: slightly wider than reference, showing the full outfit
- The model should be in a natural, relaxed pose — DO NOT force specific poses
- Let the pose flow naturally from the reference photos
- Product shoe clearly visible
- SAME outfit as reference (only the shoe changes)
- SAME background/location as reference
- SAME lighting as reference
- ABSOLUTELY NO text, watermarks, or graphics`,
  });

  prompts.push({
    cut: 2,
    label: CUT_LABELS[2],
    labelKr: CUT_LABELS_KR[2],
    prompt: `${commonHeader}
CUT 2: FULL-BODY SHOT 2
Photograph the model from a slightly different camera angle than CUT 1.
- Camera: different angle (e.g. 3/4 view, or slightly from the side)
- The model should look natural and relaxed — no forced or dramatic poses
- Full body visible, product shoe visible
- SAME outfit as reference (only the shoe changes)
- SAME background/location as reference
- SAME lighting as reference
- ABSOLUTELY NO text, watermarks, or graphics`,
  });

  prompts.push({
    cut: 3,
    label: CUT_LABELS[3],
    labelKr: CUT_LABELS_KR[3],
    prompt: `${commonHeader}
CUT 3: FULL-BODY SHOT 3
Photograph the model from yet another angle, creating visual variety.
- Camera: different framing from CUT 1 and CUT 2
- Natural, editorial mood — the model simply exists in the space
- Product shoe visible in the frame
- SAME outfit as reference (only the shoe changes)
- SAME background/location as reference
- SAME lighting as reference
- ABSOLUTELY NO text, watermarks, or graphics`,
  });

  // ── CUT 4~6: 같은 룩 허리 밑 착용 사진 ──

  prompts.push({
    cut: 4,
    label: CUT_LABELS[4],
    labelKr: CUT_LABELS_KR[4],
    prompt: `${commonHeader}
CUT 4: WAIST-DOWN SHOT 1 (SAME OUTFIT)
Photograph the model from the waist down, showing how the shoe pairs with the outfit.
- Framing: waist to shoes — crop above the waist, do NOT show face or upper body
- Front-facing angle
- Natural standing pose — relaxed, weight slightly shifted
- Show the pants/skirt + shoe pairing naturally
- SAME outfit/pants as reference
- SAME background/floor as reference
- SAME lighting as reference
- ABSOLUTELY NO text, watermarks, or graphics`,
  });

  prompts.push({
    cut: 5,
    label: CUT_LABELS[5],
    labelKr: CUT_LABELS_KR[5],
    prompt: `${commonHeader}
CUT 5: WAIST-DOWN SHOT 2 (SAME OUTFIT)
Photograph the model from the waist down, from a SIDE angle.
- Framing: waist to shoes, side view
- Natural leg position — the model just standing or walking
- Show the shoe's side profile and silhouette clearly
- SAME outfit/pants as reference
- SAME background/floor as reference
- SAME lighting as reference
- ABSOLUTELY NO text, watermarks, or graphics`,
  });

  prompts.push({
    cut: 6,
    label: CUT_LABELS[6],
    labelKr: CUT_LABELS_KR[6],
    prompt: `${commonHeader}
CUT 6: WAIST-DOWN SHOT 3 (SAME OUTFIT)
Photograph the model from the waist down, from another angle.
- Framing: waist to shoes, different angle from CUT 4 and CUT 5 (e.g. 3/4 view, slight diagonal)
- Natural, unstaged feel — as if photographed candidly
- Show the shoe in context with the full lower-body outfit
- SAME outfit/pants as reference
- SAME background/floor as reference
- SAME lighting as reference
- ABSOLUTELY NO text, watermarks, or graphics`,
  });

  // ── CUT 7~9: 같은 룩 허리 밑 다른 앵글 ──

  prompts.push({
    cut: 7,
    label: CUT_LABELS[7],
    labelKr: CUT_LABELS_KR[7],
    prompt: `${commonHeader}

CUT 7: WAIST-DOWN SHOT — CLOSE-UP ANGLE
Photograph the model from the waist down, focusing on the shoe at a CLOSE-UP LOW ANGLE.
- Framing: knees to shoes — closer than CUT 4-6, emphasizing the shoe
- Camera at LOW angle, almost ground level, looking UP at the shoe
- SAME outfit as reference model (do NOT change clothes)
- Product shoe clearly visible, filling more of the frame
- SAME background/floor, SAME lighting as reference
- ABSOLUTELY NO text, watermarks, or graphics`,
  });

  prompts.push({
    cut: 8,
    label: CUT_LABELS[8],
    labelKr: CUT_LABELS_KR[8],
    prompt: `${commonHeader}

CUT 8: WAIST-DOWN SHOT — BACK ANGLE
Photograph the model from the waist down, from BEHIND the model.
- Framing: waist to shoes, shot from the back
- Show the shoe's heel and back profile
- Natural stance — weight slightly shifted, one foot slightly ahead
- SAME outfit as reference model (do NOT change clothes)
- SAME background/floor, SAME lighting as reference
- ABSOLUTELY NO text, watermarks, or graphics`,
  });

  prompts.push({
    cut: 9,
    label: CUT_LABELS[9],
    labelKr: CUT_LABELS_KR[9],
    prompt: `${commonHeader}

CUT 9: WAIST-DOWN SHOT — WALKING / DYNAMIC
Photograph the model from the waist down in a natural WALKING or STEPPING motion.
- Framing: waist to shoes, mid-stride dynamic pose
- Capture the shoe in motion — natural, editorial feel
- Show how the shoe looks during movement
- SAME outfit as reference model (do NOT change clothes)
- SAME background/floor, SAME lighting as reference
- ABSOLUTELY NO text, watermarks, or graphics`,
  });

  return prompts;
}

// ==================== 카드 설정 타입 (앱 UI에서 편집 가능) ====================

export interface CardConfig {
  brandName: string;
  phoneNumber: string;
  businessHours: string;
  brandDescription: string;
  specNotes: string[];      // 주의사항 항목들
  warrantyNotes: string[];  // 품질보증 항목들
}

export interface CardPreviewTextConfig {
  cleanSpecTitle: string;
  cleanBrandBody: string;
  cleanVisualSlot: string;
  visualSlotImage?: string;
}

export interface NaverTemplateSection {
  title: string;
  body: string;
}

export interface NaverTemplateSpecRow {
  label: string;
  value: string;
}

export interface NaverTemplateConfig {
  enabled: boolean;
  headline: string;
  subHeadline: string;
  sellingPoints: string[];
  detailSections: NaverTemplateSection[];
  specRows: NaverTemplateSpecRow[];
  shippingNotes: string[];
}

export interface NaverTemplatePreviewSlot {
  label: string;
  imageUrl?: string;
  comment?: string;
}

export type CardPreviewTemplateId =
  | 'minimal_musinsa'
  | 'luxe_mono'
  | 'warm_editorial'
  | 'gallery_split'
  | 'soft_modern';

export const CARD_PREVIEW_TEMPLATES: Array<{
  id: CardPreviewTemplateId;
  label: string;
  description: string;
}> = [
  { id: 'minimal_musinsa', label: '안 A', description: '절제된 흑백 톤과 정돈된 정보 위계' },
  { id: 'luxe_mono', label: '안 B', description: '블랙 포인트와 넓은 여백의 럭셔리 모노톤' },
  { id: 'warm_editorial', label: '안 C', description: '웜 뉴트럴 배경과 에디토리얼 문장 중심 구성' },
  { id: 'gallery_split', label: '안 D', description: '이미지 갤러리형 분할 레이아웃과 강한 구조감' },
  { id: 'soft_modern', label: '안 E', description: '밝은 톤과 얇은 선 중심의 소프트 프리미엄' },
];

export const DEFAULT_CARD_CONFIG: CardConfig = {
  brandName: 'BRAND',
  phoneNumber: '070-0000-0000',
  businessHours: 'MON-FRI 10:00 - 18:00 (LUNCH BREAK 13:00 - 14:00)',
  brandDescription: 'Thank you for purchasing our products. We use independently developed leather processed according to traditional handicraft techniques.',
  specNotes: [
    '상품은 주문 후 제작되며, 배송까지 주말 제외 약 10일이 소요됩니다.',
    '사이즈 확인을 위해 신발을 착용하시는 경우, 밝은 색 내피 가죽은 이염될 수 있으므로 밝은 양말을 착용해 주세요.',
    '천연 가죽 특성상 개체별 색감의 차이, 고유 주름 및 스크래치가 있을 수 있습니다.',
    '세탁은 가죽 전문 세탁소를 이용해 주세요.',
    '천연 가죽을 사용하여 만들어지는 제품의 특성상 미세한 스크래치, 가죽 결의 다름이 보일 수 있습니다.',
  ],
  warrantyNotes: [
    '상품은 1회에 한해 교환 및 반품이 가능합니다.',
    '품질 보증기간은 수령일로부터 1년이며, 소모성 항목이 아닌 부분에 대한 훼손은 보증기간 내 무상 A/S가 가능합니다.',
    'A/S가 필요한 경우 Q&A 또는 카카오톡 채널을 통해 접수 부탁드립니다.',
  ],
};

export const DEFAULT_CARD_PREVIEW_TEXT_CONFIG: CardPreviewTextConfig = {
  cleanSpecTitle: 'PRODUCT DETAILS',
  cleanBrandBody: '과한 장식 없이 여백과 타이포만으로 정리한 브랜드 카드 방향입니다. 심플하지만 밀도 있게 보이는 무신사식 톤을 기준으로 잡았습니다.',
  cleanVisualSlot: 'SIGNATURE VISUAL',
};

export const DEFAULT_NAVER_TEMPLATE_CONFIG: NaverTemplateConfig = {
  enabled: true,
  headline: '데일리 룩에 바로 어울리는 정돈된 실루엣의 더비 슈즈',
  subHeadline: '과하지 않은 볼륨감과 안정적인 착화 밸런스로 출근룩부터 격식 있는 자리까지 자연스럽게 연결됩니다.',
  sellingPoints: [
    '군더더기 없는 라스트와 정돈된 토 쉐입',
    '팬츠 밑단과 자연스럽게 맞물리는 단정한 비율',
    '데일리 착용을 고려한 안정적인 착화감',
    '포멀과 캐주얼 사이를 넓게 커버하는 활용도',
  ],
  detailSections: [
    {
      title: 'CHECK POINT',
      body: '첫인상은 단정하지만 실제로는 다양한 룩에 쉽게 연결되는 범용성이 강점입니다. 매끈한 실루엣과 안정적인 밸런스로 부담 없이 코디할 수 있습니다.',
    },
    {
      title: 'SILHOUETTE',
      body: '앞코와 갑피 라인이 과하게 날카롭지 않아 데님, 슬랙스, 와이드 팬츠까지 폭넓게 어울립니다. 전체적인 라인은 깔끔하게 정리되어 신었을 때 발 모양이 단정해 보입니다.',
    },
    {
      title: 'STYLING',
      body: '출근룩, 하객룩, 데일리 코디 모두에 자연스럽게 녹아드는 타입으로 하나 소장해두면 활용 빈도가 높은 기본 슈즈로 쓰기 좋습니다.',
    },
  ],
  specRows: [
    { label: '추천 코디', value: '슬랙스, 데님, 와이드 팬츠, 셋업' },
    { label: '활용 장면', value: '출근, 데일리, 하객룩, 세미포멀' },
    { label: '실루엣', value: '정돈된 토 쉐입과 안정적인 밸런스' },
    { label: '무드', value: '클린, 포멀, 미니멀' },
  ],
  shippingNotes: [
    '주문량에 따라 발송 일정이 변동될 수 있습니다.',
    '교환 및 반품은 수령 후 상품 상태 확인 뒤 접수해 주세요.',
    '사이즈 선택 전 평소 착용하시는 구두/운동화 핏을 함께 비교해 확인해 주세요.',
  ],
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMultilineText(value: string): string {
  return escapeHtml(value).replace(/\n/g, '<br/>');
}

export function buildNaverCommerceSectionHTML(
  config: NaverTemplateConfig,
  productName: string,
): string {
  if (!config.enabled) {
    return '';
  }

  const sellingPointsHtml = config.sellingPoints
    .filter(Boolean)
    .map((item) => `<li style="padding:12px 0;border-top:1px solid #ececec;font-size:14px;line-height:1.7;color:#222;">${escapeHtml(item)}</li>`)
    .join('');

  const detailSectionsHtml = config.detailSections
    .filter((section) => section.title.trim() || section.body.trim())
    .map((section) => `
      <div style="padding:22px 0;border-top:1px solid #ededed;">
        <div style="font-size:12px;font-weight:800;letter-spacing:0.16em;color:#14a000;margin-bottom:10px;">${escapeHtml(section.title || 'DETAIL')}</div>
        <div style="font-size:15px;line-height:1.9;color:#222;">${formatMultilineText(section.body)}</div>
      </div>
    `)
    .join('');

  const specRowsHtml = config.specRows
    .filter((row) => row.label.trim() || row.value.trim())
    .map((row) => `
      <div style="display:grid;grid-template-columns:112px 1fr;gap:14px;padding:12px 0;border-top:1px solid #ededed;">
        <div style="font-size:12px;font-weight:700;color:#666;">${escapeHtml(row.label)}</div>
        <div style="font-size:13px;line-height:1.8;color:#222;">${formatMultilineText(row.value)}</div>
      </div>
    `)
    .join('');

  const shippingNotesHtml = config.shippingNotes
    .filter(Boolean)
    .map((note) => `<li style="margin:0 0 8px 18px;color:#444;">${escapeHtml(note)}</li>`)
    .join('');

  return `
    <section style="max-width:860px;margin:0 auto;padding:42px 30px 46px;background:#fff;border-top:12px solid #f5f5f5;border-bottom:12px solid #f5f5f5;font-family:'Pretendard','Apple SD Gothic Neo',sans-serif;">
      <div style="margin-bottom:28px;">
        <div style="display:inline-flex;align-items:center;gap:8px;padding:7px 12px;border-radius:999px;background:#1ec800;color:#fff;font-size:12px;font-weight:800;letter-spacing:0.08em;">NAVER COMMERCE</div>
        <h2 style="margin:16px 0 10px;font-size:34px;line-height:1.2;letter-spacing:-0.05em;color:#111;">${escapeHtml(config.headline || productName)}</h2>
        <p style="margin:0;font-size:15px;line-height:1.9;color:#444;">${formatMultilineText(config.subHeadline)}</p>
      </div>

      <div style="display:grid;grid-template-columns:1.1fr 0.9fr;gap:22px;margin-bottom:28px;">
        <div style="padding:24px 22px;background:#fafafa;border:1px solid #ececec;">
          <div style="font-size:12px;font-weight:800;letter-spacing:0.16em;color:#111;margin-bottom:10px;">KEY POINT</div>
          <ul style="margin:0;padding:0;list-style:none;">${sellingPointsHtml}</ul>
        </div>
        <div style="padding:24px 22px;background:#f7fbf4;border:1px solid #dcefd4;">
          <div style="font-size:12px;font-weight:800;letter-spacing:0.16em;color:#14a000;margin-bottom:10px;">QUICK INFO</div>
          ${specRowsHtml}
        </div>
      </div>

      <div style="margin-bottom:28px;border-top:2px solid #111;border-bottom:1px solid #ededed;">
        ${detailSectionsHtml}
      </div>

      <div style="padding:22px 24px;background:#fbfbfb;border:1px solid #ededed;">
        <div style="font-size:12px;font-weight:800;letter-spacing:0.16em;color:#111;margin-bottom:12px;">SHOPPING GUIDE</div>
        <ul style="margin:0;padding:0 0 0 2px;font-size:13px;line-height:1.8;color:#444;list-style-position:inside;">
          ${shippingNotesHtml}
        </ul>
      </div>
    </section>
  `;
}

export function buildNaverCommercePreviewHTML(
  config: NaverTemplateConfig,
  productName: string,
): string {
  return `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Naver Commerce Preview</title>
  </head>
  <body style="margin:0;background:#f2f4f5;padding:18px;">
    ${buildNaverCommerceSectionHTML(config, productName)}
  </body>
</html>`;
}

export function buildNaverCommerceTemplatePreviewHTMLLegacy(
  config: NaverTemplateConfig,
  productName: string,
  slots: NaverTemplatePreviewSlot[],
): string {
  const safeSlots = slots.length > 0 ? slots : [{ label: 'PHOTO SLOT 1', comment: '' }];
  const getSlot = (index: number) => safeSlots[index % safeSlots.length];
  const getComment = (index: number, fallback: string) => formatMultilineText(getSlot(index).comment || fallback);
  const imageSlot = (index: number, label: string, height: number, bg = '#f5f5f5') => {
    const slot = getSlot(index);
    return slot.imageUrl
      ? `<div style="width:100%;height:${height}px;overflow:hidden;background:${bg};"><img src="${slot.imageUrl}" alt="${escapeHtml(label)}" style="width:100%;height:100%;object-fit:cover;display:block;" /></div>`
      : `<div style="width:100%;height:${height}px;border:1px dashed #c9c9c9;background:${bg};display:flex;align-items:center;justify-content:center;color:#999;font-size:11px;letter-spacing:0.16em;">${escapeHtml(label)}</div>`;
  };
  const plainSlot = (label: string, height: number, bg = '#f5f5f5') => `
    <div style="width:100%;height:${height}px;border:1px dashed #c9c9c9;background:${bg};display:flex;align-items:center;justify-content:center;color:#999;font-size:11px;letter-spacing:0.16em;">
      ${escapeHtml(label)}
    </div>
  `;
  const circle = (text: string) => `
    <div style="width:152px;height:152px;border-radius:50%;background:#d8d8d8;display:flex;align-items:center;justify-content:center;padding:18px;text-align:center;color:#5d5d5d;font-size:12px;line-height:1.65;">
      ${text}
    </div>
  `;
  const circleStack = (startIndex: number) => `
    <div style="display:grid;gap:10px;justify-items:center;">
      ${circle(getComment(startIndex, config.sellingPoints[startIndex % config.sellingPoints.length] || '핵심 포인트'))}
      ${circle(getComment(startIndex + 1, config.sellingPoints[(startIndex + 1) % config.sellingPoints.length] || '핵심 포인트'))}
      ${circle(getComment(startIndex + 2, config.sellingPoints[(startIndex + 2) % config.sellingPoints.length] || '핵심 포인트'))}
    </div>
  `;
  const checkSection = (title: string, slotIndex: number, label: string, caption: string) => `
    <section style="max-width:860px;margin:0 auto;background:#fff;padding:18px 34px 24px;">
      <div style="font-size:28px;line-height:1;color:#bbbbbb;font-weight:300;margin-bottom:14px;">${escapeHtml(title)}</div>
      <div style="display:grid;grid-template-columns:1fr 200px;gap:18px;align-items:center;">
        <div>
          ${imageSlot(slotIndex, label, 320)}
          <div style="margin-top:8px;font-size:12px;line-height:1.8;color:#777;text-align:center;">${formatMultilineText(caption)}</div>
        </div>
        ${circleStack(slotIndex)}
      </div>
    </section>
  `;

  return `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Taeri Smartstore Template Replica</title>
  </head>
  <body style="margin:0;background:#f6f6f6;font-family:'Pretendard','Apple SD Gothic Neo',sans-serif;color:#222;">
    <div style="background:#333;color:#fff;padding:9px 16px;font-size:11px;letter-spacing:0.18em;">TAERI SMARTSTORE TEMPLATE REPLICA</div>

    <section style="max-width:860px;margin:0 auto;background:#fff;padding:24px 34px 18px;">
      <div style="display:grid;grid-template-columns:320px 1fr;gap:28px;align-items:start;">
        <div>
          ${imageSlot(0, 'MAIN PRODUCT SLOT', 320)}
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px;">
            ${Array.from({ length: 4 }, (_, index) => imageSlot(index, `THUMB ${index + 1}`, 64)).join('')}
          </div>
        </div>
        <div>
          <div style="font-size:12px;color:#999;margin-bottom:8px;">상품 정보 / 가격 / 옵션 / 혜택 / 배송 UI 영역</div>
          <h1 style="margin:0 0 10px;font-size:28px;line-height:1.24;letter-spacing:-0.05em;color:#111;">${escapeHtml(productName || config.headline)}</h1>
          <div style="padding:12px 14px;background:#fafafa;border:1px solid #ececec;font-size:14px;line-height:1.8;color:#444;">${formatMultilineText(config.subHeadline)}</div>
          <div style="display:grid;grid-template-columns:110px 1fr;gap:10px;margin-top:14px;font-size:12px;line-height:1.8;">
            ${config.specRows.map((row) => `<div style="color:#888;">${escapeHtml(row.label)}</div><div style="color:#222;">${formatMultilineText(row.value)}</div>`).join('')}
          </div>
        </div>
      </div>
    </section>

    <section style="max-width:860px;margin:0 auto;background:#fff;padding:0 34px 18px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;background:#d7d7d7;">
        <div style="padding:34px 28px;background:#d4d4d4;display:flex;flex-direction:column;justify-content:flex-end;min-height:300px;">
          <div style="font-size:36px;line-height:1.04;letter-spacing:-0.06em;color:#fff;font-weight:800;">BEST BASIC<br/>남성정장구두</div>
          <div style="margin-top:12px;font-size:14px;line-height:1.9;color:#f8f8f8;">${getComment(0, config.headline)}</div>
        </div>
        <div style="padding:16px 16px 16px 0;">
          ${imageSlot(1, 'HERO MODEL SLOT', 320)}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;">
        ${imageSlot(1, 'MODEL SLOT 2', 220)}
        ${imageSlot(2, 'MODEL SLOT 3', 220)}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:0;background:#d8d8d8;margin-top:16px;">
        <div style="padding:30px;background:#d8d8d8;display:flex;flex-direction:column;justify-content:center;">
          <div style="font-size:32px;line-height:1.06;letter-spacing:-0.05em;color:#fff;font-weight:800;">Black Dress Shoes</div>
          <div style="margin-top:10px;font-size:14px;line-height:1.9;color:#f8f8f8;">${getComment(1, config.subHeadline)}</div>
        </div>
        <div style="padding:18px;background:#fff;">
          ${imageSlot(0, 'PRODUCT BEAUTY SLOT', 260)}
        </div>
      </div>
    </section>

    <section style="max-width:860px;margin:0 auto;background:#ededed;padding:22px 34px;">
      <div style="text-align:center;font-size:13px;color:#666;margin-bottom:10px;">신규구매자의 솔직한 리뷰</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;text-align:center;">
        <div style="background:#fff;padding:14px 10px;"><div style="font-size:28px;font-weight:800;">4.8</div><div style="font-size:11px;color:#888;">상품만족도</div></div>
        <div style="background:#fff;padding:14px 10px;"><div style="font-size:28px;font-weight:800;">4,217</div><div style="font-size:11px;color:#888;">리뷰수</div></div>
        <div style="background:#fff;padding:14px 10px;"><div style="font-size:28px;font-weight:800;color:#d75d5d;">1</div><div style="font-size:11px;color:#888;">대표 포인트</div></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px;">
        ${Array.from({ length: 12 }, (_, index) => imageSlot(index % 3, `REVIEW PHOTO ${index + 1}`, 96)).join('')}
      </div>
    </section>

    <section style="max-width:860px;margin:0 auto;background:#fff;padding:24px 34px 18px;">
      <div style="text-align:center;font-size:12px;line-height:1.9;color:#787878;margin-bottom:16px;">
        ${formatMultilineText(config.detailSections[0]?.body || config.subHeadline)}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div style="padding:12px;background:#fafafa;border:1px solid #ececec;">${imageSlot(0, 'SMALL FEATURE SLOT 1', 120)}</div>
        <div style="padding:12px;background:#fafafa;border:1px solid #ececec;">${imageSlot(1, 'SMALL FEATURE SLOT 2', 120)}</div>
        <div style="padding:12px;background:#fafafa;border:1px solid #ececec;">${imageSlot(2, 'SMALL FEATURE SLOT 3', 120)}</div>
        <div style="padding:12px;background:#fafafa;border:1px solid #ececec;">${imageSlot(0, 'SMALL FEATURE SLOT 4', 120)}</div>
      </div>
    </section>

    ${checkSection('CHECK POINT', 0, 'CHECK IMAGE SLOT 1', config.detailSections[0]?.body || config.subHeadline)}
    ${checkSection('CHECK POINT', 1, 'CHECK IMAGE SLOT 2', config.detailSections[1]?.body || config.subHeadline)}
    ${checkSection('CHECK POINT', 2, 'CHECK IMAGE SLOT 3', config.detailSections[2]?.body || config.subHeadline)}

    <section style="max-width:860px;margin:0 auto;background:#fff;padding:24px 34px;">
      <div style="text-align:center;font-size:12px;color:#777;margin-bottom:16px;">기능 비교 / 인포그래픽 구간</div>
      <div style="display:grid;grid-template-columns:1fr 200px;gap:18px;align-items:center;margin-bottom:18px;">
        <div>${plainSlot('PRESSURE MAP SLOT', 260)}</div>
        ${circleStack(0)}
      </div>
      <div style="display:grid;grid-template-columns:1fr 200px;gap:18px;align-items:center;">
        <div>${plainSlot('SOLE / CUSHION SLOT', 260)}</div>
        ${circleStack(1)}
      </div>
    </section>

    <section style="max-width:860px;margin:0 auto;background:#fff;padding:24px 34px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
        ${plainSlot('WORKSHOP SLOT 1', 170)}
        ${plainSlot('WORKSHOP SLOT 2', 170)}
      </div>
      <div style="margin:16px auto 0;max-width:620px;text-align:center;font-size:12px;line-height:1.9;color:#777;">
        ${formatMultilineText(config.detailSections[2]?.body || config.subHeadline)}
      </div>
    </section>

    <section style="max-width:860px;margin:0 auto;background:#fff;padding:20px 34px;">
      ${Array.from({ length: 8 }, (_, index) => `<div style="margin-bottom:18px;">${imageSlot(1 + (index % 2), `LONG MODEL SLOT ${index + 1}`, 420, '#fafafa')}</div>`).join('')}
      <div style="margin:8px 0 12px;text-align:center;font-size:13px;color:#666;">캐주얼, 정장에도 어울리는 전신 착용컷 영역</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">
        ${Array.from({ length: 4 }, (_, index) => imageSlot(1 + (index % 2), `LOOK THUMB ${index + 1}`, 110)).join('')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:12px;">
        ${Array.from({ length: 3 }, (_, index) => imageSlot(1 + (index % 2), `SEATED CUT ${index + 1}`, 140)).join('')}
      </div>
    </section>

    <section style="max-width:860px;margin:0 auto;background:#fff;padding:24px 34px;">
      <div style="display:grid;gap:16px;">
        ${imageSlot(0, 'PRODUCT SOLO SLOT 1', 180)}
        ${imageSlot(0, 'PRODUCT SOLO SLOT 2', 180)}
        ${imageSlot(0, 'PRODUCT SOLO SLOT 3', 180)}
        ${imageSlot(0, 'PRODUCT SOLO SLOT 4', 180)}
      </div>
      <div style="margin-top:18px;border:1px solid #dcdcdc;">
        <div style="display:grid;grid-template-columns:110px 1fr;background:#f4f4f4;font-size:12px;font-weight:700;color:#555;">
          <div style="padding:10px;border-right:1px solid #dcdcdc;">항목</div>
          <div style="padding:10px;">내용</div>
        </div>
        ${config.shippingNotes.map((note, index) => `
          <div style="display:grid;grid-template-columns:110px 1fr;border-top:1px solid #dcdcdc;font-size:12px;line-height:1.8;">
            <div style="padding:10px;border-right:1px solid #dcdcdc;background:#fafafa;color:#666;">안내 ${index + 1}</div>
            <div style="padding:10px;color:#333;">${escapeHtml(note)}</div>
          </div>
        `).join('')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px;">
        ${imageSlot(0, 'SIZE GUIDE SLOT', 160)}
        ${plainSlot('DETAIL SCALE SLOT', 160)}
      </div>
    </section>

    <section style="max-width:860px;margin:0 auto;background:#fff;padding:18px 34px 32px;">
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;">
        ${Array.from({ length: 5 }, (_, index) => imageSlot(index % 3, `RELATED ${index + 1}`, 84)).join('')}
      </div>
      <div style="margin-top:18px;padding-top:14px;border-top:1px solid #ececec;font-size:12px;line-height:1.9;color:#777;">
        하단 리뷰 / 문의 / 추천상품 영역 자리
      </div>
    </section>
  </body>
</html>`;
}

export function buildNaverCommerceTemplatePreviewHTML(
  config: NaverTemplateConfig,
  productName: string,
  slots: NaverTemplatePreviewSlot[],
): string {
  const safeSlots = slots.length > 0 ? slots : [{ label: 'PHOTO SLOT 1', comment: '' }];
  const slotCount = safeSlots.length;
  const getSlot = (index: number) => safeSlots[((index % slotCount) + slotCount) % slotCount];
  const getCopy = (index: number, fallback: string) => formatMultilineText(getSlot(index).comment || fallback);
  const photoSlot = (
    index: number,
    label: string,
    height: number,
    bg = '#f4f4f4',
    fit: 'cover' | 'contain' = 'cover',
  ) => {
    const slot = getSlot(index);
    return slot.imageUrl
      ? `
        <div style="width:100%;height:${height}px;overflow:hidden;background:${bg};">
          <img src="${slot.imageUrl}" alt="${escapeHtml(slot.label || label)}" style="width:100%;height:100%;object-fit:${fit};display:block;" />
        </div>
      `
      : `
        <div style="width:100%;height:${height}px;border:1px dashed #c8c8c8;background:${bg};display:flex;align-items:center;justify-content:center;color:#999;font-size:11px;letter-spacing:0.16em;">
          ${escapeHtml(slot.label || label)}
        </div>
      `;
  };
  const placeholder = (label: string, height: number) => `
    <div style="width:100%;height:${height}px;border:1px dashed #c8c8c8;background:#f8f8f8;display:flex;align-items:center;justify-content:center;color:#a0a0a0;font-size:11px;letter-spacing:0.16em;">
      ${escapeHtml(label)}
    </div>
  `;
  const noteBubble = (text: string) => `
    <div style="width:152px;height:152px;border-radius:50%;background:#dbdbdb;display:flex;align-items:center;justify-content:center;padding:18px;text-align:center;color:#555;font-size:12px;line-height:1.7;">
      ${text}
    </div>
  `;
  const noteColumn = (startIndex: number) => `
    <div style="display:grid;gap:10px;justify-items:center;">
      ${noteBubble(getCopy(startIndex, config.sellingPoints[startIndex % config.sellingPoints.length] || '핵심 포인트'))}
      ${noteBubble(getCopy(startIndex + 1, config.sellingPoints[(startIndex + 1) % config.sellingPoints.length] || '착화 포인트'))}
      ${noteBubble(getCopy(startIndex + 2, config.sellingPoints[(startIndex + 2) % config.sellingPoints.length] || '디테일 포인트'))}
    </div>
  `;
  const checkSection = (title: string, slotIndex: number, copy: string) => `
    <section style="max-width:860px;margin:0 auto;background:#fff;padding:18px 34px 26px;">
      <div style="font-size:30px;line-height:1;color:#bdbdbd;font-weight:300;margin-bottom:14px;">${escapeHtml(title)}</div>
      <div style="display:grid;grid-template-columns:1fr 200px;gap:20px;align-items:center;">
        <div>
          ${photoSlot(slotIndex, `CHECK ${slotIndex + 1}`, 330)}
          <div style="margin-top:10px;font-size:12px;line-height:1.85;color:#777;text-align:center;">${formatMultilineText(copy)}</div>
        </div>
        ${noteColumn(slotIndex)}
      </div>
    </section>
  `;
  const infoRowsHtml = config.specRows
    .map((row) => `<div style="color:#8b8b8b;">${escapeHtml(row.label)}</div><div style="color:#222;">${formatMultilineText(row.value)}</div>`)
    .join('');
  const shippingRowsHtml = config.shippingNotes
    .map((note, index) => `
      <div style="display:grid;grid-template-columns:110px 1fr;border-top:1px solid #dcdcdc;font-size:12px;line-height:1.8;">
        <div style="padding:10px;border-right:1px solid #dcdcdc;background:#fafafa;color:#666;">안내 ${index + 1}</div>
        <div style="padding:10px;color:#333;">${escapeHtml(note)}</div>
      </div>
    `)
    .join('');

  return `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Taeri Smartstore Template Preview</title>
  </head>
  <body style="margin:0;background:#f3f3f3;font-family:'Pretendard','Apple SD Gothic Neo',sans-serif;color:#222;">
    <div style="background:#353535;color:#fff;padding:9px 16px;font-size:11px;letter-spacing:0.18em;">TAERI STYLE SMARTSTORE PREVIEW</div>

    <section style="max-width:860px;margin:0 auto;background:#fff;padding:24px 34px 18px;">
      <div style="display:grid;grid-template-columns:320px 1fr;gap:28px;align-items:start;">
        <div>
          ${photoSlot(0, 'MAIN PRODUCT', 320)}
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px;">
            ${Array.from({ length: 4 }, (_, index) => photoSlot(index + 1, `THUMB ${index + 1}`, 64)).join('')}
          </div>
        </div>
        <div>
          <div style="font-size:12px;color:#999;margin-bottom:8px;">상품정보 / 옵션 / 배송안내 영역</div>
          <h1 style="margin:0 0 10px;font-size:28px;line-height:1.24;letter-spacing:-0.05em;color:#111;">${escapeHtml(productName || config.headline)}</h1>
          <div style="padding:12px 14px;background:#fafafa;border:1px solid #ececec;font-size:14px;line-height:1.85;color:#444;">${formatMultilineText(config.subHeadline)}</div>
          <div style="display:grid;grid-template-columns:110px 1fr;gap:10px;margin-top:14px;font-size:12px;line-height:1.8;">
            ${infoRowsHtml}
          </div>
        </div>
      </div>
    </section>

    <section style="max-width:860px;margin:0 auto;background:#fff;padding:0 34px 18px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;background:#d5d5d5;">
        <div style="padding:34px 28px;min-height:320px;background:#d2d2d2;display:flex;flex-direction:column;justify-content:flex-end;">
          <div style="font-size:36px;line-height:1.02;letter-spacing:-0.06em;color:#fff;font-weight:800;">BEST BASIC<br/>FORMAL SHOES</div>
          <div style="margin-top:12px;font-size:14px;line-height:1.9;color:#fafafa;">${getCopy(5, config.headline)}</div>
        </div>
        <div style="padding:16px 16px 16px 0;">
          ${photoSlot(5, 'HERO MODEL', 320)}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;">
        ${photoSlot(6, 'SUB MODEL 1', 220)}
        ${photoSlot(7, 'SUB MODEL 2', 220)}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;background:#d8d8d8;margin-top:16px;">
        <div style="padding:30px;background:#d8d8d8;display:flex;flex-direction:column;justify-content:center;">
          <div style="font-size:32px;line-height:1.06;letter-spacing:-0.05em;color:#fff;font-weight:800;">Black Dress Shoes</div>
          <div style="margin-top:10px;font-size:14px;line-height:1.9;color:#fafafa;">${getCopy(8, config.subHeadline)}</div>
        </div>
        <div style="padding:18px;background:#fff;">
          ${photoSlot(8, 'DETAIL PRODUCT', 260, '#fff', 'contain')}
        </div>
      </div>
    </section>

    <section style="max-width:860px;margin:0 auto;background:#ececec;padding:22px 34px;">
      <div style="text-align:center;font-size:13px;color:#666;margin-bottom:10px;">실제 구매 고객이 자주 남기는 포토 리뷰 흐름</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;text-align:center;">
        <div style="background:#fff;padding:14px 10px;"><div style="font-size:28px;font-weight:800;">4.8</div><div style="font-size:11px;color:#888;">상품 만족도</div></div>
        <div style="background:#fff;padding:14px 10px;"><div style="font-size:28px;font-weight:800;">4,217</div><div style="font-size:11px;color:#888;">리뷰 수</div></div>
        <div style="background:#fff;padding:14px 10px;"><div style="font-size:28px;font-weight:800;color:#d55d5d;">1</div><div style="font-size:11px;color:#888;">재구매 포인트</div></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px;">
        ${Array.from({ length: 12 }, (_, index) => photoSlot(index, `REVIEW ${index + 1}`, 96)).join('')}
      </div>
    </section>

    <section style="max-width:860px;margin:0 auto;background:#fff;padding:24px 34px 18px;">
      <div style="text-align:center;font-size:12px;line-height:1.9;color:#787878;margin-bottom:16px;">
        ${formatMultilineText(config.detailSections[0]?.body || config.subHeadline)}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div style="padding:12px;background:#fafafa;border:1px solid #ececec;">${photoSlot(8, 'FEATURE 1', 120, '#fafafa', 'contain')}</div>
        <div style="padding:12px;background:#fafafa;border:1px solid #ececec;">${photoSlot(9, 'FEATURE 2', 120)}</div>
        <div style="padding:12px;background:#fafafa;border:1px solid #ececec;">${photoSlot(10, 'FEATURE 3', 120)}</div>
        <div style="padding:12px;background:#fafafa;border:1px solid #ececec;">${photoSlot(11, 'FEATURE 4', 120)}</div>
      </div>
    </section>

    ${checkSection('CHECK POINT', 9, config.detailSections[0]?.body || config.subHeadline)}
    ${checkSection('CHECK POINT', 10, config.detailSections[1]?.body || config.subHeadline)}
    ${checkSection('CHECK POINT', 11, config.detailSections[2]?.body || config.subHeadline)}

    <section style="max-width:860px;margin:0 auto;background:#fff;padding:24px 34px;">
      <div style="text-align:center;font-size:12px;color:#777;margin-bottom:16px;">기능 비교 / 인포그래픽 구간</div>
      <div style="display:grid;grid-template-columns:1fr 200px;gap:18px;align-items:center;margin-bottom:18px;">
        <div>${placeholder('PRESSURE MAP', 260)}</div>
        ${noteColumn(0)}
      </div>
      <div style="display:grid;grid-template-columns:1fr 200px;gap:18px;align-items:center;">
        <div>${placeholder('SOLE / CUSHION INFO', 260)}</div>
        ${noteColumn(3)}
      </div>
    </section>

    <section style="max-width:860px;margin:0 auto;background:#fff;padding:24px 34px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
        ${placeholder('WORKSHOP 1', 170)}
        ${placeholder('WORKSHOP 2', 170)}
      </div>
      <div style="margin:16px auto 0;max-width:620px;text-align:center;font-size:12px;line-height:1.9;color:#777;">
        ${formatMultilineText(config.detailSections[2]?.body || config.subHeadline)}
      </div>
    </section>

    <section style="max-width:860px;margin:0 auto;background:#fff;padding:20px 34px;">
      ${Array.from({ length: 8 }, (_, index) => `<div style="margin-bottom:18px;">${photoSlot(5 + index, `LONG MODEL ${index + 1}`, 420)}</div>`).join('')}
      <div style="margin:8px 0 12px;text-align:center;font-size:13px;color:#666;">전신 착용컷이 길게 이어지는 네이버형 흐름</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">
        ${Array.from({ length: 4 }, (_, index) => photoSlot(6 + index, `LOOK THUMB ${index + 1}`, 110)).join('')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:12px;">
        ${Array.from({ length: 3 }, (_, index) => photoSlot(7 + index, `SEATED CUT ${index + 1}`, 140)).join('')}
      </div>
    </section>

    <section style="max-width:860px;margin:0 auto;background:#fff;padding:24px 34px;">
      <div style="display:grid;gap:16px;">
        ${photoSlot(0, 'PRODUCT SOLO 1', 180, '#fff', 'contain')}
        ${photoSlot(1, 'PRODUCT SOLO 2', 180, '#fff', 'contain')}
        ${photoSlot(2, 'PRODUCT SOLO 3', 180, '#fff', 'contain')}
        ${photoSlot(3, 'PRODUCT SOLO 4', 180, '#fff', 'contain')}
      </div>
      <div style="margin-top:18px;border:1px solid #dcdcdc;">
        <div style="display:grid;grid-template-columns:110px 1fr;background:#f4f4f4;font-size:12px;font-weight:700;color:#555;">
          <div style="padding:10px;border-right:1px solid #dcdcdc;">항목</div>
          <div style="padding:10px;">내용</div>
        </div>
        ${shippingRowsHtml}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px;">
        ${photoSlot(4, 'SIZE GUIDE', 160, '#fff', 'contain')}
        ${placeholder('DETAIL SCALE', 160)}
      </div>
    </section>

    <section style="max-width:860px;margin:0 auto;background:#fff;padding:18px 34px 32px;">
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;">
        ${Array.from({ length: 5 }, (_, index) => photoSlot(index + 5, `RELATED ${index + 1}`, 84)).join('')}
      </div>
      <div style="margin-top:18px;padding-top:14px;border-top:1px solid #ececec;font-size:12px;line-height:1.9;color:#777;">
        하단 리뷰 / 문의 / 추천상품 영역 자리
      </div>
    </section>
  </body>
</html>`;
}

export function buildEditorialNaverTemplatePreviewHTML(
  config: NaverTemplateConfig,
  productName: string,
  slots: NaverTemplatePreviewSlot[],
): string {
  const safeSlots = slots.length > 0 ? slots : [{ label: 'PHOTO SLOT 1', comment: '' }];
  const slotCount = safeSlots.length;
  const getSlot = (index: number) => safeSlots[((index % slotCount) + slotCount) % slotCount];
  const getCopy = (index: number, fallback: string) => formatMultilineText(getSlot(index).comment || fallback);
  const sellingPoints = config.sellingPoints.filter(Boolean);
  const detailSections = config.detailSections.filter((section) => section?.title || section?.body);
  const specRows = config.specRows.filter((row) => row?.label || row?.value);
  const shippingNotes = config.shippingNotes.filter(Boolean);
  const titleText = productName || config.headline;

  const photoSlot = (
    index: number,
    label: string,
    height: number,
    bg = '#ffffff',
    fit: 'cover' | 'contain' = 'contain',
  ) => {
    const slot = getSlot(index);
    return slot.imageUrl
      ? `
        <div style="width:100%;height:${height}px;overflow:hidden;background:${bg};">
          <img src="${slot.imageUrl}" alt="${escapeHtml(slot.label || label)}" style="width:100%;height:100%;object-fit:${fit};display:block;" />
        </div>
      `
      : `
        <div style="width:100%;height:${height}px;border:1px dashed #c8c8c8;background:${bg};display:flex;align-items:center;justify-content:center;color:#999999;font-size:11px;letter-spacing:0.16em;">
          ${escapeHtml(slot.label || label)}
        </div>
      `;
  };

  const statCard = (value: string, label: string, accent = '#111111') => `
    <div style="background:#ffffff;padding:14px 10px;text-align:center;">
      <div style="font-size:28px;font-weight:800;color:${accent};line-height:1;">${value}</div>
      <div style="margin-top:8px;font-size:11px;color:#888888;">${label}</div>
    </div>
  `;

  const pointCardsHtml = sellingPoints.slice(0, 4).map((point, index) => `
    <div style="background:#f4f4f4;border:1px solid #d9d9d9;padding:18px 16px;">
      <div style="font-size:11px;letter-spacing:0.14em;color:#777777;font-weight:700;">POINT ${String(index + 1).padStart(2, '0')}</div>
      <div style="margin-top:10px;font-size:13px;line-height:1.8;color:#222222;">${formatMultilineText(point)}</div>
    </div>
  `).join('');

  const reviewQuotesHtml = [9, 10, 11].map((slotIndex, index) => `
    <div style="background:#d8d8d8;padding:16px 14px;text-align:center;">
      <div style="font-size:11px;color:#777777;letter-spacing:0.14em;font-weight:700;">NOTE ${String(index + 1).padStart(2, '0')}</div>
      <div style="margin-top:10px;font-size:12px;line-height:1.8;color:#444444;">${getCopy(slotIndex, sellingPoints[index] || config.subHeadline)}</div>
    </div>
  `).join('');

  const reviewGalleryHtml = Array.from({ length: 12 }, (_, index) => `
    <div style="background:#ffffff;border:1px solid #dddddd;padding:6px;">
      ${photoSlot([5, 6, 7, 8, 0, 1, 2, 3, 5, 6, 7, 8][index], `REVIEW ${index + 1}`, 118, '#ffffff', 'contain')}
    </div>
  `).join('');

  const circleNotes = (startIndex: number) => `
    <div style="display:grid;gap:10px;justify-items:center;">
      <div style="width:152px;height:152px;border-radius:50%;background:#d9d9d9;display:flex;align-items:center;justify-content:center;padding:18px;text-align:center;color:#555555;font-size:12px;line-height:1.7;">${getCopy(startIndex, sellingPoints[startIndex % Math.max(sellingPoints.length, 1)] || config.subHeadline)}</div>
      <div style="width:152px;height:152px;border-radius:50%;background:#d9d9d9;display:flex;align-items:center;justify-content:center;padding:18px;text-align:center;color:#555555;font-size:12px;line-height:1.7;">${getCopy(startIndex + 1, sellingPoints[(startIndex + 1) % Math.max(sellingPoints.length, 1)] || config.subHeadline)}</div>
      <div style="width:152px;height:152px;border-radius:50%;background:#d9d9d9;display:flex;align-items:center;justify-content:center;padding:18px;text-align:center;color:#555555;font-size:12px;line-height:1.7;">${getCopy(startIndex + 2, sellingPoints[(startIndex + 2) % Math.max(sellingPoints.length, 1)] || config.subHeadline)}</div>
    </div>
  `;

  const detailSectionsHtml = (detailSections.length > 0 ? detailSections : [{ title: 'CHECK POINT', body: config.subHeadline }])
    .slice(0, 3)
    .map((section, index) => `
      <section style="max-width:860px;margin:0 auto;background:#ffffff;padding:18px 34px 26px;">
        <div style="font-size:30px;line-height:1;color:#bdbdbd;font-weight:300;margin-bottom:14px;">${escapeHtml(section.title || `SECTION ${index + 1}`)}</div>
        <div style="display:grid;grid-template-columns:1fr 200px;gap:20px;align-items:center;">
          <div>
            ${photoSlot(9 + index, `CHECK ${index + 1}`, 330, '#ffffff', 'contain')}
            <div style="margin-top:10px;font-size:12px;line-height:1.85;color:#777777;text-align:center;">${formatMultilineText(section.body || config.subHeadline)}</div>
          </div>
          ${circleNotes(index * 3)}
        </div>
      </section>
    `)
    .join('');

  const longModelCutsHtml = Array.from({ length: 10 }, (_, index) => {
    const slotIndex = 5 + (index % 4);
    const height = index === 0 ? 280 : index < 4 ? 360 : 430;
    return `<div style="margin-bottom:18px;">${photoSlot(slotIndex, `LONG MODEL ${index + 1}`, height, '#ffffff', 'contain')}</div>`;
  }).join('');

  const productSoloHtml = Array.from({ length: 4 }, (_, index) => photoSlot(index, `PRODUCT SOLO ${index + 1}`, 176, '#ffffff', 'contain')).join('');
  const lookThumbsHtml = Array.from({ length: 4 }, (_, index) => photoSlot(5 + (index % 4), `LOOK THUMB ${index + 1}`, 104, '#ffffff', 'contain')).join('');
  const seatedCutsHtml = Array.from({ length: 3 }, (_, index) => photoSlot(6 + (index % 4), `SEATED CUT ${index + 1}`, 138, '#ffffff', 'contain')).join('');
  const specRowsHtml = specRows.map((row) => `
    <div style="display:grid;grid-template-columns:110px 1fr;border-top:1px solid #dcdcdc;font-size:12px;line-height:1.8;">
      <div style="padding:10px;border-right:1px solid #dcdcdc;background:#fafafa;color:#666666;">${escapeHtml(row.label)}</div>
      <div style="padding:10px;color:#333333;">${formatMultilineText(row.value)}</div>
    </div>
  `).join('');
  const shippingRowsHtml = shippingNotes.map((note, index) => `
    <div style="display:grid;grid-template-columns:110px 1fr;border-top:1px solid #dcdcdc;font-size:12px;line-height:1.8;">
      <div style="padding:10px;border-right:1px solid #dcdcdc;background:#fafafa;color:#666666;">안내 ${index + 1}</div>
      <div style="padding:10px;color:#333333;">${escapeHtml(note)}</div>
    </div>
  `).join('');

  const faqHtml = shippingNotes.map((note, index) => `
    <div style="padding:14px 0;border-top:1px solid #ececec;">
      <div style="font-size:13px;font-weight:700;color:#111111;">Q${index + 1}. ${escapeHtml(specRows[index]?.label || `자주 묻는 질문 ${index + 1}`)}</div>
      <div style="margin-top:8px;font-size:12px;line-height:1.85;color:#555555;">${escapeHtml(note)}</div>
    </div>
  `).join('');

  const reviewListHtml = Array.from({ length: 12 }, (_, index) => `
    <div style="display:grid;grid-template-columns:58px 1fr 54px;gap:12px;padding:12px 0;border-top:1px solid #efefef;align-items:start;">
      <div style="font-size:11px;color:#999999;">${String(index + 1).padStart(2, '0')}</div>
      <div>
        <div style="font-size:12px;font-weight:700;color:#111111;">${escapeHtml(specRows[index % Math.max(specRows.length, 1)]?.label || '구매 후기')}</div>
        <div style="margin-top:6px;font-size:12px;line-height:1.8;color:#555555;">${getCopy(9 + (index % 3), shippingNotes[index % Math.max(shippingNotes.length, 1)] || config.subHeadline)}</div>
      </div>
      <div>${photoSlot(index % 4, `REVIEW THUMB ${index + 1}`, 54, '#ffffff', 'contain')}</div>
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Shoe Studio Smartstore Detail</title>
  </head>
  <body style="margin:0;background:#f3f3f3;font-family:'Pretendard','Apple SD Gothic Neo',sans-serif;color:#222222;">
    <div style="background:#353535;color:#ffffff;padding:9px 16px;font-size:11px;letter-spacing:0.18em;">SHOE STUDIO SMARTSTORE PREVIEW</div>

    <section style="max-width:860px;margin:0 auto;background:#ffffff;padding:24px 34px 18px;">
      <div style="display:grid;grid-template-columns:320px 1fr;gap:28px;align-items:start;">
        <div>
          ${photoSlot(0, 'MAIN PRODUCT', 320, '#ffffff', 'contain')}
          <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px;">
            ${Array.from({ length: 4 }, (_, index) => photoSlot(index + 1, `THUMB ${index + 1}`, 64, '#ffffff', 'contain')).join('')}
          </div>
        </div>
        <div>
          <div style="font-size:12px;color:#999999;margin-bottom:8px;">상품정보 / 옵션 / 배송안내 영역</div>
          <h1 style="margin:0 0 10px;font-size:28px;line-height:1.24;letter-spacing:-0.05em;color:#111111;">${escapeHtml(titleText)}</h1>
          <div style="padding:12px 14px;background:#fafafa;border:1px solid #ececec;font-size:14px;line-height:1.85;color:#444444;">${formatMultilineText(config.subHeadline)}</div>
          <div style="display:grid;grid-template-columns:110px 1fr;gap:10px;margin-top:14px;font-size:12px;line-height:1.8;">
            ${specRowsHtml}
          </div>
        </div>
      </div>
    </section>

    <section style="max-width:860px;margin:0 auto;background:#ffffff;padding:0 34px 18px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;background:#d5d5d5;">
        <div style="padding:34px 28px;min-height:320px;background:#d2d2d2;display:flex;flex-direction:column;justify-content:flex-end;">
          <div style="font-size:36px;line-height:1.02;letter-spacing:-0.06em;color:#ffffff;font-weight:800;">BEST BASIC<br/>FORMAL SHOES</div>
          <div style="margin-top:12px;font-size:14px;line-height:1.9;color:#fafafa;">${getCopy(5, config.headline)}</div>
        </div>
        <div style="padding:16px 16px 16px 0;">
          ${photoSlot(5, 'HERO MODEL', 320, '#ffffff', 'contain')}
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;">
        ${photoSlot(6, 'SUB MODEL 1', 220, '#ffffff', 'contain')}
        ${photoSlot(7, 'SUB MODEL 2', 220, '#ffffff', 'contain')}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;background:#d8d8d8;margin-top:16px;">
        <div style="padding:30px;background:#d8d8d8;display:flex;flex-direction:column;justify-content:center;">
          <div style="font-size:32px;line-height:1.06;letter-spacing:-0.05em;color:#ffffff;font-weight:800;">Black Dress Shoes</div>
          <div style="margin-top:10px;font-size:14px;line-height:1.9;color:#fafafa;">${getCopy(8, config.subHeadline)}</div>
        </div>
        <div style="padding:18px;background:#ffffff;">
          ${photoSlot(8, 'DETAIL PRODUCT', 260, '#ffffff', 'contain')}
        </div>
      </div>
    </section>

    <section style="max-width:860px;margin:0 auto;background:#ececec;padding:22px 34px;">
      <div style="text-align:center;font-size:13px;color:#666666;margin-bottom:10px;">실구매자의 솔직한 리뷰</div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;text-align:center;">
        ${statCard('4.8', '상품 만족도')}
        ${statCard('4,217', '리뷰 수')}
        ${statCard('1', '재구매율', '#d55d5d')}
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:10px;">
        ${reviewQuotesHtml}
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px;">
        ${reviewGalleryHtml}
      </div>
    </section>

    <section style="max-width:860px;margin:0 auto;background:#ffffff;padding:24px 34px 18px;">
      <div style="text-align:center;font-size:12px;line-height:1.9;color:#787878;margin-bottom:16px;">${formatMultilineText(config.subHeadline)}</div>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;">
        ${pointCardsHtml}
      </div>
    </section>

    ${detailSectionsHtml}

    <section style="max-width:860px;margin:0 auto;background:#ffffff;padding:24px 34px;">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
        ${photoSlot(0, 'WORKSHOP 1', 180, '#ffffff', 'contain')}
        ${photoSlot(1, 'WORKSHOP 2', 180, '#ffffff', 'contain')}
      </div>
      <div style="margin:16px auto 0;max-width:620px;text-align:center;font-size:12px;line-height:1.9;color:#777777;">${formatMultilineText(config.subHeadline)}</div>
    </section>

    <section style="max-width:860px;margin:0 auto;background:#ffffff;padding:20px 34px;">
      ${longModelCutsHtml}
      <div style="margin:8px 0 12px;text-align:center;font-size:13px;color:#666666;">캐주얼, 정장에도 어울리는 구두</div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">
        ${lookThumbsHtml}
      </div>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:12px;">
        ${seatedCutsHtml}
      </div>
    </section>

    <section style="max-width:860px;margin:0 auto;background:#ffffff;padding:24px 34px;">
      <div style="display:grid;gap:16px;">
        ${productSoloHtml}
      </div>
      <div style="margin-top:18px;border:1px solid #dcdcdc;">
        <div style="display:grid;grid-template-columns:110px 1fr;background:#f4f4f4;font-size:12px;font-weight:700;color:#555555;">
          <div style="padding:10px;border-right:1px solid #dcdcdc;">항목</div>
          <div style="padding:10px;">내용</div>
        </div>
        ${shippingRowsHtml}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px;">
        ${photoSlot(4, 'SIZE GUIDE', 160, '#ffffff', 'contain')}
        <div style="border:1px solid #dcdcdc;background:#ffffff;padding:16px 18px;font-size:12px;line-height:1.9;color:#666666;">
          <div style="font-weight:700;color:#222222;margin-bottom:8px;">브랜드 카드</div>
          <div>${formatMultilineText(config.headline)}</div>
          <div style="margin-top:8px;">${formatMultilineText(config.subHeadline)}</div>
        </div>
      </div>
    </section>

    <section style="max-width:860px;margin:0 auto;background:#ffffff;padding:22px 34px;">
      <div style="font-size:12px;color:#666666;text-align:center;margin-bottom:14px;">자주 묻는 질문</div>
      <div style="border-top:1px solid #ececec;border-bottom:1px solid #ececec;">
        ${faqHtml}
      </div>
    </section>

    <section style="max-width:860px;margin:0 auto;background:#ffffff;padding:22px 34px 34px;">
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;">
        ${Array.from({ length: 5 }, (_, index) => photoSlot(5 + (index % 4), `RELATED ${index + 1}`, 84, '#ffffff', 'contain')).join('')}
      </div>
      <div style="margin-top:18px;padding-top:14px;border-top:1px solid #ececec;">
        <div style="display:grid;grid-template-columns:1fr 120px 1fr;gap:12px;align-items:center;background:#f7f7f7;padding:12px 16px;">
          <div style="text-align:center;">${statCard('4.6', '전체 평점')}</div>
          <div style="text-align:center;font-size:38px;font-weight:800;color:#d55d5d;">T</div>
          <div style="text-align:center;">${statCard('리뷰', '베스트 셀러')}</div>
        </div>
        <div style="margin-top:14px;">
          ${reviewListHtml}
        </div>
      </div>
    </section>
  </body>
</html>`;
}

function generateSpecCardHTML(config: CardConfig, textConfig?: CardPreviewTextConfig): string {
  let noteIndex = 1;
  const specItems = config.specNotes.map(note => {
    const num = String(noteIndex++).padStart(2, '0');
    return `
      <div style="display: flex; gap: 24px; padding: 22px 0; border-bottom: 1px solid #d4d4d4;">
        <span style="font-size: 11px; font-weight: 800; color: #111; padding-top: 1px;">${num}</span>
        <span style="font-size: 14px; line-height: 1.7; color: #333; font-weight: 400;">${note}</span>
      </div>`;
  }).join('');

  const warrantyItems = config.warrantyNotes.map((note, index, arr) => {
    const num = String(noteIndex++).padStart(2, '0');
    const isLast = index === arr.length - 1;
    const border = isLast ? '1px solid #111' : '1px solid #d4d4d4';
    return `
      <div style="display: flex; gap: 24px; padding: 22px 0; border-bottom: ${border};">
        <span style="font-size: 11px; font-weight: 800; color: #111; padding-top: 1px;">${num}</span>
        <span style="font-size: 14px; line-height: 1.7; color: #333; font-weight: 400;">${note}</span>
      </div>`;
  }).join('');

  const hasLunch = config.businessHours.includes('(');
  const timeMain = hasLunch ? config.businessHours.split('(')[0].trim() : config.businessHours;
  const timeSub = hasLunch ? '(' + config.businessHours.split('(')[1] : '';

  return `<div style="width: 100%; max-width: 800px; background: #ffffff; margin: 0 auto; font-family: 'Apple SD Gothic Neo', 'Pretendard', sans-serif;">
  <div style="margin: 40px; border: 2px solid #111; padding: 60px 40px;">
    <div>
      <div style="font-size: 10px; font-weight: 700; color: #888; letter-spacing: 0.15em; margin-bottom: 16px;">PRODUCT SPEC & INFO</div>
      <div style="font-size: 28px; font-weight: 900; color: #111; letter-spacing: -0.03em; margin-bottom: 40px;">${textConfig ? textConfig.cleanSpecTitle : '상품 안내 및 주의사항'}</div>
      <div style="border-top: 2px solid #111;">
${specItems}
${warrantyItems}
      </div>
      <div style="padding: 36px 0 0 0;">
        <div style="display: flex; justify-content: space-between; align-items: flex-end;">
          <div>
            <div style="font-size: 10px; font-weight: 700; color: #888; margin-bottom: 12px; letter-spacing: 0.1em;">CUSTOMER CENTER</div>
            <div style="font-size: 26px; font-weight: 900; color: #111; letter-spacing: -0.02em;">${config.phoneNumber}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 12px; font-weight: 600; color: #444; letter-spacing: 0.02em; margin-bottom: 4px;">${timeMain}</div>
            <div style="font-size: 11px; font-weight: 500; color: #aaa; letter-spacing: 0.02em;">${timeSub}</div>
          </div>
        </div>
      </div>
    </div>`;
}

function generateBrandCardHTML(config: CardConfig, textConfig?: CardPreviewTextConfig): string {
  return `
    <div style="height: 1px; background: #e1e1e1; margin: 60px 0;"></div>

    <div>
      <div style="font-size: 10px; font-weight: 700; color: #888; letter-spacing: 0.15em; margin-bottom: 20px;">BRAND EDITORIAL</div>
      <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 40px;">
        <div style="font-size: 38px; font-weight: 900; color: #111; letter-spacing: -0.04em; max-width: 60%; word-break: keep-all; line-height: 1.1;">${config.brandName}</div>
        <div style="font-size: 12px; font-weight: 600; color: #888; letter-spacing: 0.02em; padding-bottom: 6px; white-space: nowrap;">Handicrafts from Korea</div>
      </div>

      <div style="display: flex; gap: 40px; margin-bottom: 50px;">
        <div style="flex: 1; font-size: 15px; font-weight: 600; line-height: 1.9; color: #111; word-break: keep-all;">
          ${textConfig ? textConfig.cleanBrandBody.replace(/\n/g, '<br>') : '바깥에 하얀 여백을 두고, 그 안에 굵은 검은색 <br>\n아웃라인을 따서 가장 정제된 레이아웃을 만들었습니다.'}
        </div>
        <div style="flex: 1; font-size: 13px; line-height: 1.8; color: #666; word-break: keep-all;">
          ${config.brandDescription.replace(/\n/g, '<br>')}
        </div>
      </div>

      <div style="height: 240px; background: #f9f9f9; border: 1px solid #e1e1e1; display: flex; align-items: center; justify-content: center; color: #888; font-size: 11px; font-weight: 700; letter-spacing: 0.25em; overflow: hidden; position: relative;">
        ${textConfig && textConfig.visualSlotImage
          ? `<img src="${textConfig.visualSlotImage}" style="width: 100%; height: 100%; object-fit: cover;" alt="Visual Slot" />`
          : (textConfig ? textConfig.cleanVisualSlot : 'SIGNATURE BRAND VISUAL AREA')}
      </div>
    </div>

  </div>
</div>`;
}

function generateSpecCardMusinsaCleanHTML(config: CardConfig, textConfig: CardPreviewTextConfig): string {
  const specItems = config.specNotes
    .slice(0, 5)
    .map(
      (note, index) => `
        <div style="display:grid;grid-template-columns:30px 1fr;gap:18px;padding:16px 0;border-top:${index === 0 ? '1px solid #dbdbd4' : '1px solid #ecece6'};">
          <span style="font-size:10px;font-weight:700;letter-spacing:0.12em;color:#8a8a83;">${String(index + 1).padStart(2, '0')}</span>
          <p style="margin:0;font-size:13px;line-height:1.9;color:#353532;">${note}</p>
        </div>`
    )
    .join('');

  const warrantyItems = config.warrantyNotes
    .slice(0, 3)
    .map(
      note => `<li style="margin:0 0 10px 18px;color:#4f4f4b;">${note}</li>`
    )
    .join('');

  return `<section style="background:#fbfbf8;border:1px solid #e7e7e1;padding:34px 36px 36px;font-family:'Pretendard','Apple SD Gothic Neo',sans-serif;color:#111;">
    <div style="display:grid;grid-template-columns:1.45fr 0.85fr;gap:34px;align-items:start;">
      <div>
        <p style="margin:0 0 12px;font-size:10px;letter-spacing:0.24em;color:#8a8a83;">SPEC CARD / A</p>
        <h3 style="margin:0 0 10px;font-size:34px;line-height:1.04;font-weight:800;letter-spacing:-0.05em;">${textConfig.cleanSpecTitle}</h3>
        <p style="margin:0 0 20px;font-size:13px;line-height:1.8;color:#72726d;">상품 정보, 케어 가이드, 교환 안내를 한 번에 정리하는 심플한 정보 카드 시안입니다.</p>
        <div>${specItems}</div>
      </div>
      <aside style="background:#f1f1eb;border:1px solid #dfdfd8;padding:22px 22px 24px;">
        <p style="margin:0 0 18px;font-size:10px;letter-spacing:0.24em;color:#7e7e77;">CS / WARRANTY</p>
        <div style="margin-bottom:18px;">
          <div style="font-size:10px;color:#8a8a83;margin-bottom:7px;letter-spacing:0.14em;">CUSTOMER CENTER</div>
          <div style="font-size:20px;font-weight:800;letter-spacing:-0.03em;color:#111;">${config.phoneNumber}</div>
        </div>
        <div style="margin-bottom:20px;">
          <div style="font-size:10px;color:#8a8a83;margin-bottom:7px;letter-spacing:0.14em;">BUSINESS HOURS</div>
          <div style="font-size:12px;line-height:1.8;color:#42423e;">${config.businessHours}</div>
        </div>
        <div style="height:1px;background:#d6d6cf;margin:0 0 18px;"></div>
        <div style="font-size:10px;color:#8a8a83;margin-bottom:10px;letter-spacing:0.14em;">WARRANTY</div>
        <ul style="margin:0;padding:0 0 0 2px;font-size:12px;line-height:1.8;color:#42423e;list-style-position:inside;">
          ${warrantyItems}
        </ul>
      </aside>
    </div>
  </section>`;
}

function generateBrandCardMusinsaCleanHTML(config: CardConfig, textConfig: CardPreviewTextConfig): string {
  return `<section style="background:#ffffff;border:1px solid #e4e4de;padding:0;font-family:'Pretendard','Apple SD Gothic Neo',sans-serif;color:#111;">
    <div style="display:grid;grid-template-columns:0.95fr 1.05fr;min-height:350px;">
      <div style="background:#f7f7f2;color:#111;padding:34px;display:flex;flex-direction:column;justify-content:space-between;border-right:1px solid #e4e4de;">
        <div>
          <p style="margin:0 0 14px;font-size:10px;letter-spacing:0.24em;color:#878780;">BRAND CARD / A</p>
          <h3 style="margin:0 0 14px;font-size:34px;line-height:1.02;font-weight:800;letter-spacing:-0.05em;">${config.brandName}</h3>
          <p style="margin:0;font-size:13px;line-height:1.9;color:#5a5a55;">${textConfig.cleanBrandBody}</p>
        </div>
        <div style="border-top:1px solid #dfdfd8;padding-top:18px;">
          <div style="font-size:10px;letter-spacing:0.18em;color:#8a8a83;margin-bottom:8px;">CONTACT</div>
          <div style="font-size:18px;font-weight:800;letter-spacing:-0.02em;margin-bottom:5px;">${config.phoneNumber}</div>
          <div style="font-size:12px;line-height:1.8;color:#5a5a55;">${config.businessHours}</div>
        </div>
      </div>
      <div style="padding:34px;display:flex;flex-direction:column;justify-content:space-between;background:#ffffff;">
        <div>
          <p style="margin:0 0 14px;font-size:10px;letter-spacing:0.22em;color:#8a8a83;">EDITORIAL NOTE</p>
          <p style="margin:0;font-size:15px;line-height:2;color:#353532;">${config.brandDescription.replace(/\n/g, '<br/>')}</p>
        </div>
        <div style="display:grid;grid-template-columns:1fr 144px;gap:24px;align-items:end;">
          <div>
            <div style="font-size:10px;letter-spacing:0.18em;color:#8a8a83;margin-bottom:10px;">MUSINSA-STYLE PREVIEW</div>
            <div style="font-size:21px;font-weight:800;letter-spacing:-0.03em;color:#111;margin-bottom:8px;">Handicrafts from Korea</div>
            <div style="font-size:12px;line-height:1.8;color:#6d6d66;">브랜드 정보와 비주얼을 분리해 보여주는 심플한 에디토리얼 카드 구조입니다.</div>
          </div>
          <div style="height:144px;border:1px solid #dbdbd4;background:linear-gradient(180deg,#f7f7f2 0%,#ecece5 100%);display:flex;align-items:center;justify-content:center;text-align:center;padding:18px;font-size:10px;letter-spacing:0.22em;color:#666;">
            ${textConfig.cleanVisualSlot}
          </div>
        </div>
      </div>
    </div>
  </section>`;
}

function generateSpecCardLuxeMonoHTML(config: CardConfig, textConfig: CardPreviewTextConfig): string {
  const specItems = config.specNotes.slice(0, 4).map((note) => `
    <div style="padding:16px 0;border-top:1px solid rgba(255,255,255,0.12);font-size:13px;line-height:1.85;color:#d7d7d2;">${note}</div>
  `).join('');
  const warrantyItems = config.warrantyNotes.slice(0, 2).map(note => `<div style="margin-bottom:10px;font-size:12px;line-height:1.8;color:#b8b8b1;">${note}</div>`).join('');
  return `<section style="background:#111;color:#f7f6f1;border:1px solid #222;padding:36px;font-family:'Pretendard','Apple SD Gothic Neo',sans-serif;">
    <div style="display:grid;grid-template-columns:1.2fr 0.8fr;gap:32px;">
      <div>
        <div style="font-size:10px;letter-spacing:0.28em;color:#7d7d77;margin-bottom:14px;">SPEC / LUXE</div>
        <h3 style="margin:0 0 14px;font-size:38px;line-height:1.02;font-weight:800;letter-spacing:-0.05em;">${textConfig.cleanSpecTitle}</h3>
        <p style="margin:0 0 24px;font-size:13px;line-height:1.9;color:#9f9f99;">고급스러운 블랙 카드 안에서 핵심 정보만 짧고 선명하게 정리하는 방향입니다.</p>
        ${specItems}
      </div>
      <aside style="background:#f5f2eb;color:#111;padding:24px;">
        <div style="font-size:10px;letter-spacing:0.2em;color:#8a867e;margin-bottom:12px;">SERVICE</div>
        <div style="font-size:21px;font-weight:800;letter-spacing:-0.03em;margin-bottom:10px;">${config.phoneNumber}</div>
        <div style="font-size:12px;line-height:1.8;color:#4f4c47;margin-bottom:18px;">${config.businessHours}</div>
        <div style="height:1px;background:#ddd6cc;margin:0 0 16px;"></div>
        <div style="font-size:10px;letter-spacing:0.2em;color:#8a867e;margin-bottom:12px;">WARRANTY</div>
        ${warrantyItems}
      </aside>
    </div>
  </section>`;
}

function generateBrandCardLuxeMonoHTML(config: CardConfig, textConfig: CardPreviewTextConfig): string {
  return `<section style="background:#f5f2eb;border:1px solid #e7dfd4;padding:36px;font-family:'Pretendard','Apple SD Gothic Neo',sans-serif;color:#111;">
    <div style="display:grid;grid-template-columns:1.05fr 0.95fr;gap:30px;align-items:stretch;">
      <div style="display:flex;flex-direction:column;justify-content:space-between;">
        <div>
          <div style="font-size:10px;letter-spacing:0.26em;color:#8a867e;margin-bottom:14px;">BRAND / LUXE</div>
          <h3 style="margin:0 0 12px;font-size:40px;line-height:0.98;font-weight:800;letter-spacing:-0.06em;">${config.brandName}</h3>
          <p style="margin:0;font-size:14px;line-height:1.95;color:#46423c;">${textConfig.cleanBrandBody}</p>
        </div>
        <div style="margin-top:24px;font-size:12px;line-height:1.9;color:#5c5750;">${config.brandDescription.replace(/\n/g, '<br/>')}</div>
      </div>
      <div style="background:#111;padding:28px;display:flex;flex-direction:column;justify-content:space-between;">
        <div style="height:190px;border:1px solid rgba(255,255,255,0.16);display:flex;align-items:center;justify-content:center;color:#d9d3ca;font-size:10px;letter-spacing:0.24em;">${textConfig.cleanVisualSlot}</div>
        <div style="padding-top:18px;">
          <div style="font-size:10px;letter-spacing:0.22em;color:#8b867c;margin-bottom:8px;">CONTACT</div>
          <div style="font-size:18px;font-weight:700;color:#fff;margin-bottom:4px;">${config.phoneNumber}</div>
          <div style="font-size:12px;line-height:1.8;color:#d0cbc4;">${config.businessHours}</div>
        </div>
      </div>
    </div>
  </section>`;
}

function generateSpecCardWarmEditorialHTML(config: CardConfig, textConfig: CardPreviewTextConfig): string {
  const rows = config.specNotes.slice(0, 4).map((note, index) => `
    <div style="display:grid;grid-template-columns:84px 1fr;gap:16px;padding:14px 0;border-top:${index === 0 ? '1px solid #d8c8b8' : '1px solid #eadfd2'};">
      <div style="font-size:11px;color:#9e826c;letter-spacing:0.18em;">POINT ${index + 1}</div>
      <div style="font-size:13px;line-height:1.9;color:#56473b;">${note}</div>
    </div>`).join('');
  return `<section style="background:#f4ece3;border:1px solid #e3d4c3;padding:34px 36px;font-family:'Pretendard','Apple SD Gothic Neo',sans-serif;color:#2b211b;">
    <div style="max-width:760px;">
      <div style="font-size:10px;letter-spacing:0.24em;color:#a18168;margin-bottom:12px;">EDITORIAL SPEC</div>
      <h3 style="margin:0 0 14px;font-size:36px;line-height:1.04;font-weight:800;letter-spacing:-0.05em;">${textConfig.cleanSpecTitle}</h3>
      <p style="margin:0 0 18px;font-size:14px;line-height:1.9;color:#6f5c4d;">무게감 있는 웜 뉴트럴 톤 안에서 정보를 읽기 좋게 정리한 편집형 스펙 카드입니다.</p>
      ${rows}
    </div>
  </section>`;
}

function generateBrandCardWarmEditorialHTML(config: CardConfig, textConfig: CardPreviewTextConfig): string {
  return `<section style="background:#fffaf4;border:1px solid #eadccf;padding:34px;font-family:'Pretendard','Apple SD Gothic Neo',sans-serif;color:#2d241e;">
    <div style="display:grid;grid-template-columns:1fr 220px;gap:26px;">
      <div>
        <div style="font-size:10px;letter-spacing:0.24em;color:#9e826c;margin-bottom:12px;">BRAND ESSAY</div>
        <h3 style="margin:0 0 14px;font-size:34px;line-height:1.02;font-weight:800;letter-spacing:-0.05em;">${config.brandName}</h3>
        <p style="margin:0 0 20px;font-size:14px;line-height:1.95;color:#5f5045;">${textConfig.cleanBrandBody}</p>
        <p style="margin:0;font-size:14px;line-height:2;color:#6b5b4f;">${config.brandDescription.replace(/\n/g, '<br/>')}</p>
      </div>
      <div style="display:flex;flex-direction:column;justify-content:space-between;">
        <div style="height:220px;background:linear-gradient(180deg,#efe2d2 0%,#e7d8c8 100%);border:1px solid #dfd0bf;display:flex;align-items:center;justify-content:center;padding:18px;text-align:center;font-size:11px;letter-spacing:0.22em;color:#7f6a59;">${textConfig.cleanVisualSlot}</div>
        <div style="padding-top:18px;border-top:1px solid #e4d6c8;">
          <div style="font-size:10px;letter-spacing:0.2em;color:#9e826c;margin-bottom:8px;">CUSTOMER CARE</div>
          <div style="font-size:16px;font-weight:700;margin-bottom:4px;">${config.phoneNumber}</div>
          <div style="font-size:12px;line-height:1.8;color:#6f5c4d;">${config.businessHours}</div>
        </div>
      </div>
    </div>
  </section>`;
}

function generateSpecCardGallerySplitHTML(config: CardConfig, textConfig: CardPreviewTextConfig): string {
  const list = config.specNotes.slice(0, 3).map(note => `<div style="padding:12px 0;border-top:1px solid #d7d7d7;font-size:13px;line-height:1.85;color:#2d2d2d;">${note}</div>`).join('');
  return `<section style="background:#fff;border:1px solid #d7d7d7;font-family:'Pretendard','Apple SD Gothic Neo',sans-serif;color:#111;">
    <div style="display:grid;grid-template-columns:240px 1fr;">
      <div style="background:#121212;color:#fff;padding:28px;display:flex;flex-direction:column;justify-content:space-between;">
        <div>
          <div style="font-size:10px;letter-spacing:0.24em;color:#8f8f8f;margin-bottom:12px;">FRAME A</div>
          <h3 style="margin:0;font-size:34px;line-height:1;font-weight:800;letter-spacing:-0.05em;">${textConfig.cleanSpecTitle}</h3>
        </div>
        <div style="font-size:12px;line-height:1.8;color:#bcbcbc;">${config.phoneNumber}<br/>${config.businessHours}</div>
      </div>
      <div style="padding:28px 30px;">
        <div style="display:grid;grid-template-columns:1fr 160px;gap:24px;align-items:start;">
          <div>${list}</div>
          <div style="height:180px;border:1px solid #d7d7d7;background:#f3f3f3;display:flex;align-items:center;justify-content:center;padding:16px;text-align:center;font-size:11px;letter-spacing:0.2em;color:#666;">${textConfig.cleanVisualSlot}</div>
        </div>
      </div>
    </div>
  </section>`;
}

function generateBrandCardGallerySplitHTML(config: CardConfig, textConfig: CardPreviewTextConfig): string {
  return `<section style="background:#fbfbfb;border:1px solid #d7d7d7;padding:28px;font-family:'Pretendard','Apple SD Gothic Neo',sans-serif;color:#111;">
    <div style="display:grid;grid-template-columns:1.1fr 0.9fr;gap:24px;align-items:stretch;">
      <div style="display:grid;gap:18px;">
        <div>
          <div style="font-size:10px;letter-spacing:0.24em;color:#7d7d7d;margin-bottom:10px;">BRAND GRID</div>
          <h3 style="margin:0 0 12px;font-size:36px;line-height:1;font-weight:800;letter-spacing:-0.05em;">${config.brandName}</h3>
          <p style="margin:0;font-size:13px;line-height:1.9;color:#4d4d4d;">${textConfig.cleanBrandBody}</p>
        </div>
        <p style="margin:0;font-size:14px;line-height:2;color:#2f2f2f;">${config.brandDescription.replace(/\n/g, '<br/>')}</p>
      </div>
      <div style="display:grid;grid-template-rows:1fr auto;gap:18px;">
        <div style="border:1px solid #d7d7d7;background:linear-gradient(180deg,#efefef 0%,#f9f9f9 100%);display:flex;align-items:center;justify-content:center;padding:18px;text-align:center;font-size:11px;letter-spacing:0.24em;color:#666;">${textConfig.cleanVisualSlot}</div>
        <div style="border-top:1px solid #d7d7d7;padding-top:14px;font-size:12px;line-height:1.8;color:#4d4d4d;">
          <strong style="display:block;font-size:10px;letter-spacing:0.2em;color:#888;margin-bottom:6px;">CONTACT</strong>
          ${config.phoneNumber}<br/>${config.businessHours}
        </div>
      </div>
    </div>
  </section>`;
}

function generateSpecCardSoftModernHTML(config: CardConfig, textConfig: CardPreviewTextConfig): string {
  const blocks = config.specNotes.slice(0, 4).map(note => `
    <div style="padding:16px;border:1px solid #e7e7ef;border-radius:16px;background:#ffffff;">
      <div style="font-size:13px;line-height:1.85;color:#3f4350;">${note}</div>
    </div>`).join('');
  return `<section style="background:linear-gradient(180deg,#eef2f7 0%,#f7f8fb 100%);border:1px solid #dfe5ef;padding:30px;font-family:'Pretendard','Apple SD Gothic Neo',sans-serif;color:#111;">
    <div style="display:flex;justify-content:space-between;gap:18px;align-items:end;margin-bottom:18px;">
      <div>
        <div style="font-size:10px;letter-spacing:0.24em;color:#7d8798;margin-bottom:10px;">SOFT MODERN</div>
        <h3 style="margin:0;font-size:34px;line-height:1.02;font-weight:800;letter-spacing:-0.05em;">${textConfig.cleanSpecTitle}</h3>
      </div>
      <div style="font-size:12px;color:#596273;">${config.phoneNumber}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">${blocks}</div>
  </section>`;
}

function generateBrandCardSoftModernHTML(config: CardConfig, textConfig: CardPreviewTextConfig): string {
  return `<section style="background:#f8fafc;border:1px solid #dfe5ef;padding:30px;font-family:'Pretendard','Apple SD Gothic Neo',sans-serif;color:#111;">
    <div style="display:grid;grid-template-columns:1fr 200px;gap:22px;align-items:start;">
      <div>
        <div style="font-size:10px;letter-spacing:0.24em;color:#7d8798;margin-bottom:10px;">BRAND STORY</div>
        <h3 style="margin:0 0 12px;font-size:34px;line-height:1.02;font-weight:800;letter-spacing:-0.05em;">${config.brandName}</h3>
        <p style="margin:0 0 16px;font-size:13px;line-height:1.9;color:#5a6578;">${textConfig.cleanBrandBody}</p>
        <p style="margin:0;font-size:14px;line-height:1.95;color:#404756;">${config.brandDescription.replace(/\n/g, '<br/>')}</p>
      </div>
      <div style="display:grid;gap:14px;">
        <div style="height:160px;border-radius:18px;border:1px solid #dfe5ef;background:linear-gradient(180deg,#ffffff 0%,#edf1f7 100%);display:flex;align-items:center;justify-content:center;padding:16px;text-align:center;font-size:11px;letter-spacing:0.22em;color:#687384;">${textConfig.cleanVisualSlot}</div>
        <div style="padding:14px 16px;border-radius:16px;background:#fff;border:1px solid #dfe5ef;font-size:12px;line-height:1.8;color:#505a6a;">${config.phoneNumber}<br/>${config.businessHours}</div>
      </div>
    </div>
  </section>`;
}

function buildTemplateCardSections(
  cardConfig: CardConfig,
  templateId: CardPreviewTemplateId,
  textConfig: CardPreviewTextConfig,
): { specHtml: string; brandHtml: string } {
  switch (templateId) {
    case 'luxe_mono':
      return {
        specHtml: generateSpecCardLuxeMonoHTML(cardConfig, textConfig),
        brandHtml: generateBrandCardLuxeMonoHTML(cardConfig, textConfig),
      };
    case 'warm_editorial':
      return {
        specHtml: generateSpecCardWarmEditorialHTML(cardConfig, textConfig),
        brandHtml: generateBrandCardWarmEditorialHTML(cardConfig, textConfig),
      };
    case 'gallery_split':
      return {
        specHtml: generateSpecCardGallerySplitHTML(cardConfig, textConfig),
        brandHtml: generateBrandCardGallerySplitHTML(cardConfig, textConfig),
      };
    case 'soft_modern':
      return {
        specHtml: generateSpecCardSoftModernHTML(cardConfig, textConfig),
        brandHtml: generateBrandCardSoftModernHTML(cardConfig, textConfig),
      };
    case 'minimal_musinsa':
    default:
      return {
        specHtml: generateSpecCardMusinsaCleanHTML(cardConfig, textConfig),
        brandHtml: generateBrandCardMusinsaCleanHTML(cardConfig, textConfig),
      };
  }
}

export function buildCardPreviewHTML(
  cardConfig: CardConfig,
  templateId: CardPreviewTemplateId,
  textConfig: CardPreviewTextConfig,
  productName: string,
): string {
  const templateLabel = CARD_PREVIEW_TEMPLATES.find(template => template.id === templateId)?.label ?? '안 A';
  const { specHtml, brandHtml } = templateId === 'minimal_musinsa'
    ? {
        specHtml: generateSpecCardHTML(cardConfig, textConfig),
        brandHtml: generateBrandCardHTML(cardConfig, textConfig),
      }
    : buildTemplateCardSections(cardConfig, templateId, textConfig);

  return `<!DOCTYPE html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>카드 템플릿 미리보기</title>
  </head>
  <body style="margin:0;background:linear-gradient(180deg,#f1f1ec 0%,#e9e9e3 100%);padding:28px;font-family:'Pretendard','Apple SD Gothic Neo',sans-serif;">
    <div style="max-width:860px;margin:0 auto;display:grid;gap:18px;">
      <div style="display:flex;align-items:end;justify-content:space-between;gap:16px;">
        <div>
          <div style="font-size:10px;letter-spacing:0.24em;color:#7c7c75;">PREVIEW / SINGLE OPTION</div>
          <h1 style="margin:10px 0 0;font-size:30px;letter-spacing:-0.05em;color:#111;">${productName}</h1>
        </div>
        <div style="font-size:11px;letter-spacing:0.16em;color:#666;">${templateLabel} PREVIEW</div>
      </div>
      ${specHtml}
      ${brandHtml}
    </div>
  </body>
</html>`;
}

// ==================== 메인 타입 ====================

export interface DetailPageResult {
  sectorName: string;
  sectorNameKr: string;
  type: 'image' | 'html' | 'product_photos';
  imageUrl?: string;
  html?: string;
  error?: string;
}

export interface DetailPageRenderImage {
  url: string;
  alt: string;
  overlayText?: string;
}

// ==================== 섹터 정의 (UI 표시용) ====================

export const SECTORS = [
  { id: 11, name: 'product_photos', nameKr: '상품 누끼 사진', type: 'product_photos' as const },
  { id: 1, name: 'editorial_1', nameKr: '모델 화보 1', type: 'image' as const },
  { id: 2, name: 'editorial_2', nameKr: '모델 화보 2', type: 'image' as const },
  { id: 3, name: 'editorial_3', nameKr: '모델 화보 3', type: 'image' as const },
  { id: 4, name: 'waist_same_1', nameKr: '허리 밑 착용 1', type: 'image' as const },
  { id: 5, name: 'waist_same_2', nameKr: '허리 밑 착용 2', type: 'image' as const },
  { id: 6, name: 'waist_same_3', nameKr: '허리 밑 착용 3', type: 'image' as const },
  { id: 7, name: 'waist_alt_1', nameKr: '허리밑 다른앵글 1', type: 'image' as const },
  { id: 8, name: 'waist_alt_2', nameKr: '허리밑 다른앵글 2', type: 'image' as const },
  { id: 9, name: 'waist_alt_3', nameKr: '허리밑 다른앵글 3', type: 'image' as const },
  { id: 10, name: 'spec_card', nameKr: '스펙카드', type: 'html' as const },
  { id: 12, name: 'brand_card', nameKr: '브랜드카드', type: 'html' as const },
];

// ==================== 메인: 상세페이지 생성 ====================

/**
 * 네이버 상세페이지 생성 (트랜서퍼 원본 13컷 구조)
 * 
 * 순서:
 * 🔹 상품 누끼 4장 (원본)
 * ①②③ 모델 전신 착용 3장 (AI)
 * ④⑤⑥ 같은 룩 허리 밑 3장 (AI)
 * ⑦⑧⑨ 다른 룩 허리 밑 3장 (AI)
 * ⑩ 스펙카드 (HTML)
 * ⑪ 브랜드카드 (HTML)
 */
export async function generateDetailPage(
  productImages: string[],
  productName: string,
  modelImages?: string[],
  onProgress?: (msg: string, current: number, total: number) => void,
  nukkiImages?: string[],
  cardConfig?: CardConfig,
  cardPreviewTemplate?: CardPreviewTemplateId,
  cardPreviewTextConfig?: CardPreviewTextConfig,
): Promise<DetailPageResult[]> {
  const results: DetailPageResult[] = [];
  const totalAI = 9; // AI 이미지 9장

  // ── 1. 상품 누끼 사진 맨 앞에 삽입 (누끼 이미지가 있으면 사용, 없으면 원본) ──
  const photosForInsert = (nukkiImages && nukkiImages.length > 0) ? nukkiImages : productImages;
  for (const imgUrl of photosForInsert.slice(0, 4)) {
    results.push({
      sectorName: 'product_photos',
      sectorNameKr: '상품 누끼 사진',
      type: 'product_photos',
      imageUrl: imgUrl,
    });
  }
  onProgress?.(`📦 상품 누끼 사진 ${Math.min(photosForInsert.length, 4)}장 삽입`, 0, totalAI);

  // 제품 이미지 → Gemini 파트 변환
  const productParts: GeminiImagePart[] = await Promise.all(
    productImages.slice(0, 4).map(url => urlToGeminiPart(url))
  );

  // ★ 복수 모델 이미지 → Gemini 파트 변환
  const modelParts: GeminiImagePart[] = [];
  if (modelImages && modelImages.length > 0) {
    for (const modelUrl of modelImages) {
      try {
        const part = await urlToGeminiPart(modelUrl);
        modelParts.push(part);
      } catch (e) {
        console.warn('[DetailPage] 모델 이미지 로드 실패:', e);
      }
    }
    console.log(`[DetailPage] ✅ ${modelParts.length}명 모델 로드 완료 → 컷별 순환 배정`);
  }

  return generateDetailPageWithModelParts(
    results,
    totalAI,
    productParts,
    modelParts,
    productName,
    onProgress,
    cardConfig,
    cardPreviewTemplate,
    cardPreviewTextConfig,
  );
}

async function generateDetailPageWithModelParts(
  results: DetailPageResult[],
  totalAI: number,
  productParts: GeminiImagePart[],
  modelParts: GeminiImagePart[],
  productName: string,
  onProgress?: (msg: string, current: number, total: number) => void,
  cardConfig?: CardConfig,
  cardPreviewTemplate?: CardPreviewTemplateId,
  cardPreviewTextConfig?: CardPreviewTextConfig,
): Promise<DetailPageResult[]> {

  // ── 2. AI 9컷 생성 (모델 순환 배정) ──
  const cuts = generateCutPrompts(productName);
  let currentImg = 0;

  for (const cut of cuts) {
    currentImg++;
    // ★ 핵심: 각 컷에 순환으로 모델 배정 (CUT1→모델1, CUT2→모델2, CUT3→모델3, CUT4→모델1...)
    const modelIdx = modelParts.length > 0 ? (currentImg - 1) % modelParts.length : -1;
    const modelLabel = modelParts.length > 1 ? ` [모델${modelIdx + 1}]` : '';
    onProgress?.(`📸 ${cut.labelKr}${modelLabel} 생성 중...`, currentImg, totalAI);

    try {
      // 해당 컷에 배정된 모델만 포함
      const imageParts = modelIdx >= 0
        ? [...productParts, modelParts[modelIdx]]
        : productParts;

      const result = await callGeminiSecure(
        cut.prompt,
        imageParts,
        {
          useGemini3Pro: true,
          aspectRatio: ASPECT_RATIO,
          imageSize: '2K',
          temperature: 0.7,
        },
      );

      if (result.type === 'image') {
        results.push({
          sectorName: cut.label,
          sectorNameKr: cut.labelKr,
          type: 'image',
          imageUrl: result.data,
        });
        onProgress?.(`✅ ${cut.labelKr} 완료!`, currentImg, totalAI);
      } else {
        results.push({
          sectorName: cut.label,
          sectorNameKr: cut.labelKr,
          type: 'image',
          error: '이미지가 반환되지 않음',
        });
      }
    } catch (error) {
      console.error(`[DetailPage] ${cut.labelKr} 실패:`, error);
      results.push({
        sectorName: cut.label,
        sectorNameKr: cut.labelKr,
        type: 'image',
        error: error instanceof Error ? error.message : '알 수 없는 오류',
      });
      onProgress?.(`❌ ${cut.labelKr} 실패`, currentImg, totalAI);
    }

    // API 보호: 컷 사이 1.5초 딜레이
    if (currentImg < totalAI) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  const cfg = cardConfig || DEFAULT_CARD_CONFIG;
  const txtCfg = cardPreviewTextConfig || DEFAULT_CARD_PREVIEW_TEXT_CONFIG;
  const selectedTemplate = cardPreviewTemplate || 'minimal_musinsa';
  const templateCards = buildTemplateCardSections(cfg, selectedTemplate, txtCfg);
  results.push({
    sectorName: 'spec_card',
    sectorNameKr: '스펙카드',
    type: 'html',
    html: selectedTemplate === 'minimal_musinsa' ? generateSpecCardHTML(cfg, txtCfg) : templateCards.specHtml,
  });

  results.push({
    sectorName: 'brand_card',
    sectorNameKr: '브랜드카드',
    type: 'html',
    html: selectedTemplate === 'minimal_musinsa' ? generateBrandCardHTML(cfg, txtCfg) : templateCards.brandHtml,
  });

  return results;
}

// ==================== HTML 조립 ====================

/**
 * 최종 상세페이지 HTML 조립
 * 
 * 순서: 누끼(원본) → 전신(AI) → 허리밑(AI) → 다른룩(AI) → 스펙+브랜드(HTML)
 */
export function assembleDetailPageHTML(
  results: DetailPageResult[],
  productName: string,
  customImages?: DetailPageRenderImage[],
): string {
  const allImages = results.filter(r => (r.type === 'image' || r.type === 'product_photos') && r.imageUrl);
  const htmlCards = results.filter(r => r.type === 'html' && r.html);

  const renderImages: DetailPageRenderImage[] = customImages && customImages.length > 0
    ? customImages
    : allImages.map(r => ({
        url: r.imageUrl!,
        alt: r.sectorNameKr,
      }));

  const imagesHtml = renderImages
    .map((image) => {
      const overlay = image.overlayText?.trim()
        ? `<div class="detail-overlay">${image.overlayText}</div>`
        : '';
      return `<div class="detail-image-block"><img src="${image.url}" alt="${image.alt}" style="width:100%;max-width:860px;display:block;margin:0 auto;" />${overlay}</div>`;
    })
    .join('\n');

  const cardsHtml = htmlCards.map(r => r.html).join('\n');

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>${productName} - 상세페이지</title>
  <style>
    body { margin:0; padding:0; background:#fff; }
    .detail-container { max-width:860px; margin:0 auto; }
    .detail-container img { width:100%; display:block; }
    .detail-image-block { position:relative; max-width:860px; margin:0 auto; }
    .detail-overlay {
      position:absolute;
      left:32px;
      right:32px;
      bottom:36px;
      color:#fff;
      font-size:30px;
      line-height:1.25;
      font-weight:800;
      letter-spacing:-0.04em;
      text-shadow:0 10px 28px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.55);
      white-space:pre-line;
      word-break:keep-all;
    }
  </style>
</head>
<body>
  <div class="detail-container">
${imagesHtml}
${cardsHtml}
  </div>
</body>
</html>`;
}
