import { useCallback, useEffect, useMemo, useState } from 'react';

interface NaverRegisterModalProps {
  visible: boolean;
  onClose: () => void;
  images: string[];
  detailHtml?: string;
  productName: string;
}

interface CategoryResult {
  id: string;
  wholeCategoryName: string;
  name?: string;
  last?: boolean;
  validated?: boolean;
  usable?: boolean;
}

interface AttributeValueInfo {
  valueSeq: number;
  valueName: string;
}

interface AttributeInfo {
  attributeSeq: number;
  attributeName: string;
  required: boolean;
  values?: AttributeValueInfo[];
  selectedValue?: string;
  selectedValueSeq?: number;
  inputValue?: string;
}

const API_BASE = 'http://localhost:13003';

function normalizeCategories(data: any): CategoryResult[] {
  const source = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
  return source
    .slice(0, 30)
    .map((c: any) => ({
      id: String(c.id || c.categoryId || c.leafCategoryId || ''),
      wholeCategoryName: c.wholeCategoryName || c.name || '',
      name: c.name,
      last: c.last,
    }))
    .filter((c: CategoryResult) => c.id && c.wholeCategoryName);
}

export default function NaverRegisterModal({
  visible,
  onClose,
  images,
  detailHtml,
  productName,
}: NaverRegisterModalProps) {
  const [name, setName] = useState(productName || '');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('100');
  const [categoryKeyword, setCategoryKeyword] = useState('');
  const [categories, setCategories] = useState<CategoryResult[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<CategoryResult | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isValidatingCategories, setIsValidatingCategories] = useState(false);
  const [brandName, setBrandName] = useState('자체제작');
  const [manufacturerName, setManufacturerName] = useState('자체제작');
  const [attributes, setAttributes] = useState<AttributeInfo[]>([]);
  const [isLoadingAttrs, setIsLoadingAttrs] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [isRegistering, setIsRegistering] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [naverConfigured, setNaverConfigured] = useState<boolean | null>(null);

  const statusChecks = useMemo(
    () => [
      { label: '상품명', ok: !!name.trim() },
      { label: '브랜드', ok: !!brandName.trim() },
      { label: '제조사', ok: !!manufacturerName.trim() },
      {
        label: '속성',
        ok:
          attributes.length === 0 ||
          attributes.filter((a) => a.required).every((a) => a.selectedValue || a.inputValue),
      },
      { label: '태그', ok: tags.length > 0 },
      { label: '이미지', ok: images.length > 0 },
    ],
    [images.length, attributes, brandName, manufacturerName, name, tags.length],
  );

  useEffect(() => {
    if (!visible) return;
    setName(productName || '');
    setResult(null);
    setProgress('');
    setCategories([]);
    setSelectedCategory(null);
    setAttributes([]);

    fetch(`${API_BASE}/api/naver/status`)
      .then((r) => r.json())
      .then((d) => setNaverConfigured(d.configured))
      .catch(() => setNaverConfigured(false));
  }, [productName, visible]);

  const loadAttributes = useCallback(async (categoryId: string) => {
    setIsLoadingAttrs(true);
    try {
      const res = await fetch(`${API_BASE}/api/naver/categories/${categoryId}/attributes`);
      const data = await res.json();
      const source = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      setAttributes(
        source.map((a: any) => ({
          attributeSeq: a.attributeSeq || a.seq || a.id,
          attributeName: a.attributeName || a.name || '',
          required: Boolean(a.required),
          values: a.values || a.attributeValues || [],
        })),
      );
    } catch {
      setAttributes([]);
    } finally {
      setIsLoadingAttrs(false);
    }
  }, []);

  if (!visible) return null;

  const searchCategories = async () => {
    const keyword = categoryKeyword.trim();
    if (!keyword) return;
    setIsSearching(true);
    setSelectedCategory(null);
    setAttributes([]);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/naver/categories/${encodeURIComponent(keyword)}`);
      const data = await res.json();
      const normalized = normalizeCategories(data);
      setCategories(normalized);
      if (normalized.length === 0) {
        setResult({ success: false, message: '카테고리를 찾지 못했습니다. 다른 키워드로 검색해보세요.' });
      }
    } catch {
      setCategories([]);
    } finally {
      setIsSearching(false);
    }
  };

  const selectCategory = (cat: CategoryResult) => {
    setSelectedCategory(cat);
    setCategories([]);
    void loadAttributes(cat.id);
  };

  const addTag = () => {
    const v = tagInput.trim();
    if (!v || tags.includes(v) || tags.length >= 10) return;
    setTags((p) => [...p, v]);
    setTagInput('');
  };

  const removeTag = (i: number) => setTags((p) => p.filter((_, idx) => idx !== i));

  const updateAttributeValue = (index: number, value: string, valueSeq?: number) => {
    setAttributes((prev) =>
      prev.map((a, i) =>
        i === index
          ? { ...a, selectedValue: value, selectedValueSeq: valueSeq, inputValue: valueSeq ? undefined : value }
          : a,
      ),
    );
  };

  const handleRegister = async () => {
    if (!name.trim() || !price.trim() || !selectedCategory) return;
    setIsRegistering(true);
    setProgress('네이버 등록 준비 중...');
    setResult(null);

    const productAttributes = attributes
      .filter((a) => a.selectedValue || a.inputValue)
      .map((a) => ({
        attributeSeq: a.attributeSeq,
        ...(a.selectedValueSeq
          ? { attributeValueSeq: a.selectedValueSeq }
          : { attributeValue: a.inputValue || a.selectedValue }),
      }));

    const sellerTags = tags.map((t) => ({ text: t }));

    try {
      // Determine mode based on image type
      const hasBase64 = images.some((img) => typeof img === 'string' && img.startsWith('data:'));

      if (hasBase64) {
        setProgress(`이미지 ${images.length}장 업로드 + 상품 등록 중...`);
        const res = await fetch(`${API_BASE}/api/naver/register-full`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name.trim(),
            leafCategoryId: selectedCategory.id,
            salePrice: parseInt(price, 10),
            stockQuantity: parseInt(stock, 10) || 100,
            thumbnailImages: images.slice(0, 1),
            detailImages: images,
            detailContent: detailHtml || '',
            brandName: brandName.trim() || undefined,
            manufacturerName: manufacturerName.trim() || undefined,
            productAttributes,
            sellerTags,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setResult({ success: true, message: `등록 성공\n상품번호: ${data.data?.originProductNo || '-'}` });
        } else {
          setResult({ success: false, message: `등록 실패: ${data.error || JSON.stringify(data.details || 'Unknown')}` });
        }
      } else {
        setProgress(`이미지 ${images.length}장 URL 업로드 + 상품 등록 중...`);
        const res = await fetch(`${API_BASE}/api/naver/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sellerProductName: name.trim(),
            leafCategoryId: selectedCategory.id,
            price: parseInt(price, 10),
            stockQuantity: parseInt(stock, 10) || 100,
            detailImageUrls: images,
            thumbnailUrl: images[0] || '',
            detailContent: detailHtml || '',
            brandName: brandName.trim() || undefined,
            manufacturerName: manufacturerName.trim() || undefined,
            productAttributes,
            sellerTags,
          }),
        });
        const data = await res.json();
        if (data.success) {
          setResult({ success: true, message: `등록 성공\n상품번호: ${data.data?.originProductNo || '-'}` });
        } else {
          setResult({ success: false, message: `등록 실패: ${data.error || JSON.stringify(data.details || 'Unknown')}` });
        }
      }
    } catch (error: any) {
      setResult({ success: false, message: `오류: ${error.message}` });
    } finally {
      setIsRegistering(false);
      setProgress('');
    }
  };

  return (
    <div className="naver-modal-overlay" onClick={onClose}>
      <div className="naver-modal" onClick={(e) => e.stopPropagation()}>
        <div className="naver-modal-header">
          <div className="naver-header-left">
            <div className="naver-badge">N</div>
            <div>
              <h3>네이버 스마트스토어 등록</h3>
              <p>6가지 항목 작성 후 네이버 상품 등록</p>
            </div>
          </div>
          <button className="naver-close-btn" onClick={onClose}>×</button>
        </div>

        <div className="naver-status-bar">
          {statusChecks.map((s) => (
            <div key={s.label} className={`naver-status-item ${s.ok ? 'ok' : 'pending'}`}>
              <span className="naver-status-icon">{s.ok ? '✅' : '⬜'}</span>
              <span>{s.label}</span>
            </div>
          ))}
        </div>

        <div className="naver-modal-body">
          {naverConfigured === false && (
            <div className="naver-alert error">
              네이버 API 키가 설정되지 않았습니다. `.env`를 확인하고 서버를 실행하세요.
            </div>
          )}

          <div className="naver-field">
            <label>{statusChecks[5].ok ? '✅' : '⬜'} 이미지 ({images.length}장)</label>
            <div className="naver-img-preview">
              {images.slice(0, 8).map((src, i) => (
                <img key={`${i}`} src={src} alt={`img-${i}`} />
              ))}
              {images.length > 8 && <div className="naver-img-more">+{images.length - 8}</div>}
            </div>
          </div>

          <div className="naver-field">
            <label>{statusChecks[0].ok ? '✅' : '⬜'} 상품명</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="상품명을 입력하세요" />
          </div>

          <div className="naver-field-row">
            <div className="naver-field" style={{ flex: 1 }}>
              <label>판매가 (원)</label>
              <input type="number" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="59000" />
            </div>
            <div className="naver-field" style={{ width: 100 }}>
              <label>재고</label>
              <input type="number" value={stock} onChange={(e) => setStock(e.target.value)} />
            </div>
          </div>

          <div className="naver-field">
            <label>카테고리</label>
            <div className="naver-search-row">
              <input
                type="text"
                value={categoryKeyword}
                onChange={(e) => setCategoryKeyword(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void searchCategories(); }}
                placeholder="예: 남성 구두, 여성 원피스, 백팩"
              />
              <button onClick={() => void searchCategories()} disabled={isSearching} className="naver-btn-primary">
                {isSearching ? '...' : '검색'}
              </button>
            </div>
            {selectedCategory && (
              <div className="naver-alert success" style={{ marginTop: 8 }}>
                {selectedCategory.wholeCategoryName}
                <button type="button" onClick={() => { setSelectedCategory(null); setAttributes([]); }}
                  style={{ marginLeft: 10, border: 'none', background: 'transparent', cursor: 'pointer' }}>변경</button>
              </div>
            )}
            {categories.length > 0 && (
              <div className="naver-category-list">
                {categories.map((c) => (
                  <button key={c.id} onClick={() => selectCategory(c)}>
                    {c.wholeCategoryName}
                    {c.validated && c.usable ? ' (등록 가능)' : ''}
                  </button>
                ))}
              </div>
            )}
            {isValidatingCategories && <p className="naver-hint">등록 가능한 카테고리만 추리는 중...</p>}
          </div>

          <div className="naver-field">
            <label>{statusChecks[1].ok ? '✅' : '⬜'} 브랜드</label>
            <input type="text" value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="브랜드명" />
          </div>

          <div className="naver-field">
            <label>{statusChecks[2].ok ? '✅' : '⬜'} 제조사</label>
            <input type="text" value={manufacturerName} onChange={(e) => setManufacturerName(e.target.value)} placeholder="제조사명" />
          </div>

          <div className="naver-field">
            <label>{statusChecks[3].ok ? '✅' : '⬜'} 속성 {isLoadingAttrs && '(로딩 중...)'}</label>
            {!selectedCategory && <p className="naver-hint">카테고리를 먼저 선택하면 속성이 자동으로 로드됩니다.</p>}
            {attributes.length > 0 && (
              <div className="naver-attrs-grid">
                {attributes.map((attr, i) => (
                  <div key={attr.attributeSeq} className="naver-attr-item">
                    <span className="naver-attr-label">
                      {attr.attributeName}
                      {attr.required && <span className="naver-required">*</span>}
                    </span>
                    {attr.values && attr.values.length > 0 ? (
                      <select
                        value={attr.selectedValueSeq || ''}
                        onChange={(e) => {
                          const m = attr.values?.find((v) => v.valueSeq === Number(e.target.value));
                          updateAttributeValue(i, m?.valueName || '', m?.valueSeq);
                        }}
                      >
                        <option value="">선택</option>
                        {attr.values.map((v) => (
                          <option key={v.valueSeq} value={v.valueSeq}>{v.valueName}</option>
                        ))}
                      </select>
                    ) : (
                      <input type="text" value={attr.inputValue || ''} onChange={(e) => updateAttributeValue(i, e.target.value)} placeholder={`${attr.attributeName} 입력`} />
                    )}
                  </div>
                ))}
              </div>
            )}
            {selectedCategory && attributes.length === 0 && !isLoadingAttrs && (
              <p className="naver-hint">이 카테고리는 필수 속성이 없습니다.</p>
            )}
          </div>

          <div className="naver-field">
            <label>{statusChecks[4].ok ? '✅' : '⬜'} 태그 ({tags.length}/10)</label>
            <div className="naver-search-row">
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } }}
                placeholder="태그 입력 후 Enter"
              />
              <button onClick={addTag} disabled={tags.length >= 10} className="naver-btn-primary">추가</button>
            </div>
            {tags.length > 0 && (
              <div className="naver-tags-list">
                {tags.map((tag, i) => (
                  <span key={`${tag}-${i}`} className="naver-tag">
                    #{tag}
                    <button onClick={() => removeTag(i)}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {progress && (
            <div className="naver-progress">
              <div className="naver-spinner" />
              {progress}
            </div>
          )}

          {result && (
            <div className={`naver-alert ${result.success ? 'success' : 'error'}`}>
              {result.message.split('\n').map((line, i) => <div key={i}>{line}</div>)}
            </div>
          )}
        </div>

        <div className="naver-modal-footer">
          <button className="naver-btn-outline" onClick={onClose}>닫기</button>
          <button
            className="naver-register-btn"
            onClick={() => void handleRegister()}
            disabled={isRegistering || !name.trim() || !price.trim() || !selectedCategory || naverConfigured === false}
          >
            {isRegistering ? (
              <><div className="naver-spinner small" />등록 중...</>
            ) : (
              `네이버에 등록 (${statusChecks.filter((s) => s.ok).length}/6)`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
