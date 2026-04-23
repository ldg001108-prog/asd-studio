import { useState } from 'react';

interface ImageItem { name: string; url: string }

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (imageUrl: string) => void;
  nukkiImages: ImageItem[];
  modelImages: ImageItem[];
  synthesisImages: ImageItem[];
}

type Tab = 'nukki' | 'model' | 'synthesis';

export default function ImagePickerModal({ visible, onClose, onSelect, nukkiImages, modelImages, synthesisImages }: Props) {
  const [tab, setTab] = useState<Tab>('nukki');
  if (!visible) return null;

  const tabs: { id: Tab; label: string; icon: string; images: ImageItem[] }[] = [
    { id: 'nukki', label: '누끼', icon: '🔲', images: nukkiImages },
    { id: 'model', label: '모델컷', icon: '🧍', images: modelImages },
    { id: 'synthesis', label: '합성컷', icon: '✨', images: synthesisImages },
  ];

  const current = tabs.find(t => t.id === tab)!;

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 600 }}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '680px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-head">
          <h3 className="modal-title">사진 선택</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div style={{ padding: '10px 16px 0', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '6px 14px', border: tab === t.id ? '1px solid #d4af37' : '1px solid #333', borderRadius: '20px',
              background: tab === t.id ? '#d4af37' : '#1a1a1a',
              color: tab === t.id ? '#0a0a0a' : '#999',
              fontFamily: 'inherit', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', transition: 'all .2s',
            }}>{t.icon} {t.label} ({t.images.length})</button>
          ))}
          <label style={{
            padding: '6px 14px', borderRadius: '20px', background: '#1a1a1a', border: '1px solid #333',
            color: '#999', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
          }}>
            📁 로컬파일
            <input type="file" accept="image/*" hidden onChange={e => {
              const file = e.target.files?.[0];
              if (!file) return;
              const reader = new FileReader();
              reader.onload = () => onSelect(reader.result as string);
              reader.readAsDataURL(file);
            }} />
          </label>
        </div>
        <div style={{ padding: '12px 16px 16px', flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {current.images.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '50px 20px', color: '#555', fontSize: '0.8rem' }}>
              {current.label} 이미지가 없습니다
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: '8px' }}>
              {current.images.map((img, i) => (
                <div
                  key={`${tab}-${i}`}
                  onClick={() => onSelect(img.url)}
                  style={{
                    cursor: 'pointer', borderRadius: '8px', overflow: 'hidden',
                    border: '2px solid transparent', transition: 'all 0.15s',
                    aspectRatio: '1', background: '#111',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = '#d4af37')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = 'transparent')}
                >
                  <img src={img.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
