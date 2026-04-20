import bcrypt from 'bcryptjs';

const NAVER_CLIENT_ID = () => process.env.NAVER_CLIENT_ID || '';
const NAVER_CLIENT_SECRET = () => process.env.NAVER_CLIENT_SECRET || '';
const NAVER_CHANNEL_ID = () => process.env.NAVER_CHANNEL_ID || '';
const COMMERCE_API = 'https://api.commerce.naver.com/external';

let cachedToken = null;
let tokenExpiry = 0;

/* ── Fallback categories (generic) ── */
const LOCAL_CATEGORIES = [
  { id: '50000782', wholeCategoryName: '패션잡화 > 남성신발 > 구두', last: true },
  { id: '50000783', wholeCategoryName: '패션잡화 > 남성신발 > 로퍼', last: true },
  { id: '50000781', wholeCategoryName: '패션잡화 > 남성신발 > 스니커즈', last: true },
  { id: '50000784', wholeCategoryName: '패션잡화 > 남성신발 > 부츠', last: true },
  { id: '50000806', wholeCategoryName: '패션잡화 > 여성신발 > 구두', last: true },
  { id: '50000807', wholeCategoryName: '패션잡화 > 여성신발 > 로퍼', last: true },
  { id: '50000805', wholeCategoryName: '패션잡화 > 여성신발 > 스니커즈', last: true },
  { id: '50000687', wholeCategoryName: '스포츠/레저 > 스포츠신발 > 런닝화', last: true },
  { id: '50001892', wholeCategoryName: '패션의류 > 남성의류 > 티셔츠', last: true },
  { id: '50001897', wholeCategoryName: '패션의류 > 남성의류 > 바지', last: true },
  { id: '50001900', wholeCategoryName: '패션의류 > 남성의류 > 아우터', last: true },
  { id: '50001910', wholeCategoryName: '패션의류 > 여성의류 > 티셔츠', last: true },
  { id: '50001915', wholeCategoryName: '패션의류 > 여성의류 > 바지', last: true },
  { id: '50001918', wholeCategoryName: '패션의류 > 여성의류 > 아우터', last: true },
  { id: '50001920', wholeCategoryName: '패션의류 > 여성의류 > 원피스', last: true },
  { id: '50002058', wholeCategoryName: '패션잡화 > 가방 > 백팩', last: true },
  { id: '50002060', wholeCategoryName: '패션잡화 > 가방 > 크로스백', last: true },
  { id: '50002062', wholeCategoryName: '패션잡화 > 가방 > 토트백', last: true },
];

const LOCAL_CATEGORY_ATTRIBUTES = {};

/* ── Helpers ── */
function ensureConfigured() {
  if (!NAVER_CLIENT_ID() || !NAVER_CLIENT_SECRET()) {
    throw new Error('NAVER_CLIENT_ID / NAVER_CLIENT_SECRET is not configured.');
  }
}

async function parseJsonResponse(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { raw: text }; }
}

async function commerceRequest(path, options = {}) {
  const token = await getNaverToken();
  const response = await fetch(`${COMMERCE_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const data = await parseJsonResponse(response);
  return { response, data };
}

async function getNaverToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry - 30_000) return cachedToken;

  ensureConfigured();
  const clientId = NAVER_CLIENT_ID();
  const clientSecret = NAVER_CLIENT_SECRET();
  const timestamp = now;
  const password = `${clientId}_${timestamp}`;
  const hashed = bcrypt.hashSync(password, clientSecret);
  const signature = Buffer.from(hashed).toString('base64');

  const params = new URLSearchParams({
    client_id: clientId,
    timestamp: String(timestamp),
    client_secret_sign: signature,
    grant_type: 'client_credentials',
    type: 'SELF',
  });

  const response = await fetch(`${COMMERCE_API}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await parseJsonResponse(response);

  if (!response.ok || !data.access_token) {
    throw new Error(`Naver token error: ${JSON.stringify(data)}`);
  }

  cachedToken = data.access_token;
  tokenExpiry = now + (data.expires_in || 300) * 1000;
  return cachedToken;
}

/* ── Category search ── */
function normalizeCategoryKeyword(keyword) {
  return String(keyword || '').toLowerCase().replace(/\s+/g, '');
}

function expandSearchKeywords(keyword) {
  // Split by spaces first, then expand each token
  const tokens = String(keyword || '').trim().split(/\s+/).filter(Boolean);
  const synonymMap = {
    '운동화': '스니커즈', '스니커즈': '운동화',
    '구두': '더비', '더비': '구두',
    '로퍼': '블로퍼', '블로퍼': '로퍼',
    '남성': '남자', '남자': '남성',
    '여성': '여자', '여자': '여성',
  };
  // Each token becomes a group: [token, synonym?]
  const groups = tokens.map((t) => {
    const norm = t.toLowerCase();
    const syns = [norm];
    if (synonymMap[norm]) syns.push(synonymMap[norm]);
    return syns;
  });
  return groups; // Array of string arrays, each group must match
}

function matchesAllKeywordGroups(name, groups) {
  // Every group must have at least one synonym matching in the name
  return groups.every((syns) => syns.some((s) => name.includes(s)));
}

function searchLocalCategories(keyword) {
  const groups = expandSearchKeywords(keyword);
  if (groups.length === 0) return [];
  return LOCAL_CATEGORIES
    .map((cat) => {
      const name = normalizeCategoryKeyword(cat.wholeCategoryName);
      const matched = matchesAllKeywordGroups(name, groups);
      const score = matched ? groups.reduce((s, g) => s + g[0].length, 0) : 0;
      return { ...cat, score };
    })
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ score, ...cat }) => cat);
}

function normalizeRemoteCategory(category) {
  return {
    id: String(category.id || category.categoryId || category.leafCategoryId || ''),
    wholeCategoryName: category.wholeCategoryName || category.name || '',
    name: category.name || '',
    last: category.last === true || category.leaf === true,
  };
}

function filterCategoriesByKeyword(categories, keyword) {
  const groups = expandSearchKeywords(keyword);
  if (groups.length === 0) return categories.filter((c) => c.last);
  const merged = new Map();
  for (const cat of categories.filter(c => c?.id)) {
    if (!merged.has(cat.id)) merged.set(cat.id, cat);
  }
  const unique = [...merged.values()];
  const strong = unique.filter((cat) => {
    const name = normalizeCategoryKeyword(cat.wholeCategoryName || cat.name || '');
    if (!cat.last) return false;
    return matchesAllKeywordGroups(name, groups);
  });
  return strong.length > 0 ? strong : unique.filter((c) => c.last);
}

/* ── Exports ── */
export function getNaverStatus() {
  const clientId = NAVER_CLIENT_ID();
  const clientSecret = NAVER_CLIENT_SECRET();
  const channelId = NAVER_CHANNEL_ID();
  return {
    configured: !!(clientId && clientSecret),
    clientId: clientId ? `${clientId.slice(0, 4)}...` : null,
    hasChannelId: !!channelId,
  };
}

export async function searchCategories(keyword) {
  const localCategories = searchLocalCategories(keyword);
  try {
    const { response, data } = await commerceRequest(`/v1/categories?keyword=${encodeURIComponent(keyword)}`, { method: 'GET' });
    if (!response.ok) throw new Error(JSON.stringify(data));
    const remote = (data.contents || data.data || data || [])
      .filter((c) => c.last === true || c.leaf === true)
      .map(normalizeRemoteCategory)
      .filter((c) => c.id);
    const pool = Array.isArray(data.contents || data.data || data) ? remote : [];
    if (pool.length > 100) return filterCategoriesByKeyword(remote, keyword);
    return filterCategoriesByKeyword([...remote, ...localCategories], keyword);
  } catch (error) {
    console.log(`[naver] category search fallback: ${error.message}`);
    return filterCategoriesByKeyword(localCategories, keyword);
  }
}

export async function getCategoryAttributes(categoryId) {
  try {
    const { response, data } = await commerceRequest(`/v1/categories/${categoryId}/attributes`, { method: 'GET' });
    if (!response.ok) throw new Error(JSON.stringify(data));
    return data.attributes || data.contents || data.data || data || [];
  } catch (error) {
    console.log(`[naver] attributes fallback: ${error.message}`);
    return LOCAL_CATEGORY_ATTRIBUTES[categoryId] || [];
  }
}

/* ── Image Upload ── */
async function uploadImageBase64(base64Data) {
  // Remove line breaks from base64 string before matching (some encoders insert \n)
  const cleaned = String(base64Data || '').replace(/\r?\n/g, '');
  const matches = cleaned.match(/^data:image\/(\w+);base64,([\s\S]+)$/);
  if (!matches) throw new Error('Invalid base64 image.');
  const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
  const buffer = Buffer.from(matches[2].replace(/\s/g, ''), 'base64');
  const boundary = `----FormBoundary${Date.now()}`;
  const filename = `asd_${Date.now()}.${ext}`;
  const header = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="imageFiles"; filename="${filename}"\r\nContent-Type: image/${matches[1]}\r\n\r\n`,
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);
  const body = Buffer.concat([header, buffer, footer]);
  const { response, data } = await commerceRequest('/v1/product-images/upload', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  });
  if (!response.ok || !data.images?.length) throw new Error(`Image upload error: ${JSON.stringify(data)}`);
  return data.images[0].url;
}

async function uploadImageFromUrl(imageUrl) {
  const { response, data } = await commerceRequest('/v1/product-images/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrls: [imageUrl] }),
  });
  if (!response.ok || !data.images?.length) throw new Error(`Image upload by URL error: ${JSON.stringify(data)}`);
  return data.images[0].url;
}

/* ── Product Build & Create ── */
function sanitizeProductName(name) {
  return String(name || '')
    .replace(/[\\*?"<>\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 99);
}

function buildDetailContent(uploadedImageUrls, detailContent) {
  const imgs = uploadedImageUrls
    .map((url) => `<img src="${url}" alt="detail" style="width:100%;max-width:860px;display:block;margin:0 auto;" />`)
    .join('\n');
  return [imgs, detailContent || ''].filter(Boolean).join('\n');
}

function stripImageTags(html) {
  return String(html || '')
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/(<div>\s*<\/div>\s*)+/gi, '')
    .trim();
}

function buildProductPayload({
  name, leafCategoryId, salePrice, stockQuantity = 100,
  naverImageUrls = [], detailContent = '',
  brandName, manufacturerName, productAttributes = [], sellerTags = [],
}) {
  const representativeImage = naverImageUrls.length > 0 ? { url: naverImageUrls[0] } : undefined;
  const optionalImages = naverImageUrls.slice(1, 10).map((url) => ({ url }));
  return {
    originProduct: {
      statusType: 'SALE',
      saleType: 'NEW',
      leafCategoryId: String(leafCategoryId),
      name: sanitizeProductName(name),
      images: {
        ...(representativeImage ? { representativeImage } : {}),
        optionalImages,
      },
      salePrice: Number(salePrice),
      stockQuantity: Number(stockQuantity),
      detailContent,
      detailAttribute: {
        afterServiceInfo: {
          afterServiceTelephoneNumber: '010-0000-0000',
          afterServiceGuideContent: '상세페이지 참조',
        },
        originAreaInfo: { originAreaCode: '04', content: '상세페이지 참조' },
        minorPurchasable: true,
        productInfoProvidedNotice: {
          productInfoProvidedNoticeType: 'ETC',
          etc: {
            returnCostReason: '상세페이지 참조',
            noRefundReason: '상세페이지 참조',
            qualityAssuranceStandard: '상세페이지 참조',
            compensationProcedure: '상세페이지 참조',
            troubleShootingContents: '상세페이지 참조',
            itemName: '상세페이지 참조',
            modelName: '상세페이지 참조',
            manufacturer: manufacturerName || '상세페이지 참조',
            afterServiceDirector: '상세페이지 참조',
          },
        },
      },
      deliveryInfo: {
        deliveryType: 'DELIVERY',
        deliveryAttributeType: 'NORMAL',
        deliveryCompany: 'CJGLS',
        deliveryFee: { deliveryFeeType: 'FREE', baseFee: 0 },
        claimDeliveryInfo: {
          returnDeliveryCompany: 'CJGLS',
          returnDeliveryFee: 5000,
          exchangeDeliveryFee: 5000,
        },
      },
      ...(brandName ? { brandName } : {}),
      ...(manufacturerName ? { manufacturerName } : {}),
      ...(productAttributes.length > 0 ? { productAttributes } : {}),
      ...(sellerTags.length > 0 ? { seoInfo: { sellerTags } } : {}),
    },
    smartstoreChannelProduct: {
      channelProductName: sanitizeProductName(name),
      storeKeepExclusiveProduct: false,
      naverShoppingRegistration: true,
      channelProductDisplayStatusType: 'ON',
    },
  };
}

async function createProduct(payload) {
  const { response, data } = await commerceRequest('/v2/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (response.ok) return { success: true, data };
  const invalidMessages = Array.isArray(data?.invalidInputs)
    ? data.invalidInputs.map((i) => `${i.name || i.key || 'field'}: ${i.message}`).join('\n')
    : '';
  return { success: false, error: invalidMessages || data.message || JSON.stringify(data), details: data };
}

async function deleteProduct(channelProductNo) {
  const { response, data } = await commerceRequest(`/v2/products/channel-products/${channelProductNo}`, { method: 'DELETE' });
  return { success: response.ok, data };
}

export async function validateCategoryUsability({ leafCategoryId, name, image, detailContent = '<div><p>category validation</p></div>' }) {
  let uploadedImageUrl = '';
  if (typeof image === 'string' && image.startsWith('data:')) {
    uploadedImageUrl = await uploadImageBase64(image);
  } else if (image) {
    uploadedImageUrl = await uploadImageFromUrl(image);
  } else {
    throw new Error('Validation image is required.');
  }
  const payload = buildProductPayload({
    name: sanitizeProductName(name || 'test product'),
    leafCategoryId, salePrice: 10000, stockQuantity: 1,
    naverImageUrls: [uploadedImageUrl], detailContent,
  });
  const created = await createProduct(payload);
  if (!created.success) return created;
  const channelProductNo = created.data?.smartstoreChannelProductNo || created.data?.channelProductNo;
  if (channelProductNo) await deleteProduct(channelProductNo);
  return { success: true, data: created.data };
}

export async function registerFull({
  name, leafCategoryId, salePrice, stockQuantity,
  thumbnailImages, detailImages, detailContent = '',
  brandName, manufacturerName, productAttributes, sellerTags,
}) {
  const naverImageUrls = [];
  const naverDetailImageUrls = [];

  // Upload thumbnail: detect base64 vs URL
  if (thumbnailImages?.length) {
    try {
      const thumb = thumbnailImages[0];
      const thumbUrl = (typeof thumb === 'string' && thumb.startsWith('data:'))
        ? await uploadImageBase64(thumb)
        : await uploadImageFromUrl(thumb);
      naverImageUrls.push(thumbUrl);
    } catch (e) { console.error('[naver] thumbnail upload failed:', e.message); }
  }

  // Upload detail images: detect base64 vs URL per image
  for (const image of detailImages || []) {
    try {
      const uploaded = (typeof image === 'string' && image.startsWith('data:'))
        ? await uploadImageBase64(image)
        : await uploadImageFromUrl(image);
      naverDetailImageUrls.push(uploaded);
      naverImageUrls.push(uploaded);
    } catch (e) { console.error('[naver] detail image upload failed:', e.message); }
  }
  const finalDetail = buildDetailContent(naverDetailImageUrls, stripImageTags(detailContent));
  const payload = buildProductPayload({
    name, leafCategoryId, salePrice, stockQuantity,
    naverImageUrls: naverImageUrls.slice(0, 10),
    detailContent: finalDetail || '<div><p>상세페이지 참조</p></div>',
    brandName, manufacturerName, productAttributes, sellerTags,
  });
  const result = await createProduct(payload);
  if (result.success) return { ...result, thumbCount: thumbnailImages?.length || 0, detailCount: naverDetailImageUrls.length };
  return result;
}

export async function registerProduct({
  sellerProductName, leafCategoryId, price, stockQuantity = 100,
  detailImageUrls, thumbnailUrl, detailContent = '',
  brandName, manufacturerName, productAttributes, sellerTags,
}) {
  const naverImageUrls = [];
  const naverDetailImageUrls = [];
  if (thumbnailUrl) {
    try { naverImageUrls.push(await uploadImageFromUrl(thumbnailUrl)); }
    catch (e) { console.error('[naver] thumbnail upload failed:', e.message); }
  }
  for (const url of (detailImageUrls || []).slice(0, 20)) {
    try {
      const uploaded = await uploadImageFromUrl(url);
      naverDetailImageUrls.push(uploaded);
      naverImageUrls.push(uploaded);
    } catch (e) { console.error('[naver] optional image upload failed:', e.message); }
  }
  const finalDetail = buildDetailContent(naverDetailImageUrls, stripImageTags(detailContent));
  const payload = buildProductPayload({
    name: sellerProductName, leafCategoryId, salePrice: price, stockQuantity,
    naverImageUrls: naverImageUrls.slice(0, 10),
    detailContent: finalDetail || '<div><p>상세페이지 참조</p></div>',
    brandName, manufacturerName, productAttributes, sellerTags,
  });
  return createProduct(payload);
}
