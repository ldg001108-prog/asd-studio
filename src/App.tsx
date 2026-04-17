import { useState, useRef, useEffect, useCallback } from 'react';
import { generateNukkiShots } from './lib/backgroundRemovalService';
import { generateModelImage, MODEL_CATEGORIES, type ModelCategory } from './lib/modelGeneratorService';
import { synthesizeShoeStudio } from './lib/shoeStudioService';
import {
  uploadProductImage,
  uploadDataUrl,
  listImages,
  deleteImage,
  listFolders,
  createFolder,
  renameFolder,
} from './lib/storageService';

// ── Types ──
interface NukkiFolder { name: string; images: { name: string; url: string }[]; isOpen: boolean }
interface SavedImage { name: string; url: string }
type AutoStatus = 'idle' | 'uploading' | 'generating' | 'saving' | 'done' | 'error';
type ModalType = 'model-gen' | 'model-storage' | 'synthesis' | null;

function App() {
  const [nukkiFolders, setNukkiFolders] = useState<NukkiFolder[]>([]);
  const [autoStatus, setAutoStatus] = useState<AutoStatus>('idle');
  const [statusMsg, setStatusMsg] = useState('');
  const [editingFolder, setEditingFolder] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [activeModal, setActiveModal] = useState<ModalType>(null);
  const [styleRefUrls, setStyleRefUrls] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<ModelCategory>('female-model');
  const [modelGenStatus, setModelGenStatus] = useState('');
  const [isModelGenerating, setIsModelGenerating] = useState(false);
  const [modelImages, setModelImages] = useState<SavedImage[]>([]);
  const [synthesisImages, setSynthesisImages] = useState<SavedImage[]>([]);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [synthStatus, setSynthStatus] = useState('');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const styleInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadNukkiFolders(); }, []);

  // ── Data Loading ──
  const loadNukkiFolders = async () => {
    try {
      const folders = await listFolders('nukki');
      const data: NukkiFolder[] = [];
      for (const f of folders) {
        const imgs = await listImages(`nukki/${f}`);
        data.push({ name: f, images: imgs.map(i => ({ name: i.name, url: i.url })), isOpen: false });
      }
      setNukkiFolders(data);
    } catch (e) { console.warn('Load failed:', e); }
  };
  const loadModelImages = async () => {
    try { const imgs = await listImages('models'); setModelImages(imgs.map(i => ({ name: i.name, url: i.url }))); } catch (e) { console.warn(e); }
  };
  const loadSynthesisImages = async () => {
    try { const imgs = await listImages('synthesis'); setSynthesisImages(imgs.map(i => ({ name: i.name, url: i.url }))); } catch (e) { console.warn(e); }
  };

  // ── Image Selection & Lightbox ──
  const toggleSelect = (key: string) => {
    setSelectedImages(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };
  const openLightbox = (url: string) => setLightboxUrl(url);
  const closeLightbox = () => setLightboxUrl(null);

  // ── Auto Pipeline ──
  const runAutoPipeline = useCallback(async (files: FileList) => {
    if (!files.length) return;
    setAutoStatus('uploading'); setStatusMsg('업로드 중...');
    const uploadedUrls: string[] = [];
    try {
      for (const file of Array.from(files)) {
        const url = await uploadProductImage(file);
        uploadedUrls.push(url);
      }
    } catch { setAutoStatus('error'); setStatusMsg('업로드 실패'); return; }

    setAutoStatus('generating'); setStatusMsg('누끼 합성 중...');
    try {
      const results = await generateNukkiShots(uploadedUrls, msg => setStatusMsg(msg));
      setAutoStatus('saving'); setStatusMsg('저장 중...');
      const folderName = `${new Date().toISOString().slice(0, 10)}_${Date.now().toString(36).slice(-4)}`;
      const labels = ['hero', 'side', 'top', 'back'];
      for (let i = 0; i < results.length; i++) await uploadDataUrl(results[i], `nukki/${folderName}`, labels[i]);
      await loadNukkiFolders();
      setAutoStatus('done'); setStatusMsg('완료');
      setTimeout(() => { setAutoStatus('idle'); setStatusMsg(''); }, 2500);
    } catch (e) { setAutoStatus('error'); setStatusMsg(`${e instanceof Error ? e.message : '실패'}`); }
  }, []);

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length) runAutoPipeline(e.dataTransfer.files);
  };

  // ── Folder Ops ──
  const toggleFolder = (name: string) => setNukkiFolders(p => p.map(f => f.name === name ? { ...f, isOpen: !f.isOpen } : f));
  const startRename = (name: string) => { setEditingFolder(name); setEditName(name); setTimeout(() => renameInputRef.current?.focus(), 50); };
  const confirmRename = async () => {
    if (!editingFolder || !editName.trim() || editName === editingFolder) { setEditingFolder(null); return; }
    try { await renameFolder('nukki', editingFolder, editName.trim()); await loadNukkiFolders(); } catch (e) { console.error(e); }
    setEditingFolder(null);
  };
  const handleNewFolder = async () => { try { await createFolder(`nukki/folder_${Date.now().toString(36).slice(-4)}`); await loadNukkiFolders(); } catch (e) { console.error(e); } };
  const handleDeleteNukkiImage = async (folder: string, img: string) => { try { await deleteImage(`nukki/${folder}/${img}`); setNukkiFolders(p => p.map(f => f.name === folder ? { ...f, images: f.images.filter(i => i.name !== img) } : f)); } catch (e) { console.error(e); } };

  // ── Folder Drag Reorder ──
  const handleFolderDragStart = (idx: number) => setDragIdx(idx);
  const handleFolderDragOver = (e: React.DragEvent, idx: number) => { e.preventDefault(); setDragOverIdx(idx); };
  const handleFolderDragEnd = () => {
    if (dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx) {
      setNukkiFolders(prev => {
        const arr = [...prev];
        const [moved] = arr.splice(dragIdx, 1);
        arr.splice(dragOverIdx, 0, moved);
        return arr;
      });
    }
    setDragIdx(null); setDragOverIdx(null);
  };

  // ── Model Gen ──
  const handleStyleUpload = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(file => { const r = new FileReader(); r.onloadend = () => setStyleRefUrls(p => [...p, r.result as string]); r.readAsDataURL(file); });
  };
  const handleGenerateModel = async () => {
    if (!styleRefUrls.length || isModelGenerating) return;
    setIsModelGenerating(true); setModelGenStatus('모델 생성 중...');
    try {
      const result = await generateModelImage(styleRefUrls, selectedCategory, msg => setModelGenStatus(msg));
      setModelGenStatus('저장 중...'); await uploadDataUrl(result, 'models', selectedCategory);
      setModelGenStatus('완료'); setTimeout(() => { setModelGenStatus(''); setIsModelGenerating(false); }, 2000);
    } catch (e) { setModelGenStatus(`실패: ${e instanceof Error ? e.message : ''}`); setIsModelGenerating(false); }
  };

  // ── Synthesis ──
  const handleSynthesize = async (nukkiUrl: string, modelUrl: string) => {
    if (isSynthesizing) return;
    setIsSynthesizing(true); setSynthStatus('합성 중...');
    try {
      const result = await synthesizeShoeStudio(nukkiUrl, modelUrl, 'minimal', false, '2K', msg => setSynthStatus(msg));
      setSynthStatus('저장 중...'); await uploadDataUrl(result, 'synthesis'); await loadSynthesisImages();
      setSynthStatus('완료'); setTimeout(() => { setSynthStatus(''); setIsSynthesizing(false); }, 2000);
    } catch (e) { setSynthStatus(`실패: ${e instanceof Error ? e.message : ''}`); setIsSynthesizing(false); }
  };

  const openModal = (type: ModalType) => {
    setActiveModal(type);
    if (type === 'model-storage') loadModelImages();
    if (type === 'synthesis') { loadSynthesisImages(); loadModelImages(); loadNukkiFolders(); }
  };

  const isBusy = ['uploading', 'generating', 'saving'].includes(autoStatus);
  const allNukkiImages = nukkiFolders.flatMap(f => f.images.map(i => ({ ...i, folder: f.name })));

  // ── Reusable Image Tile ──
  const ImageTile = ({ src, id, onDelete, square }: { src: string; id: string; onDelete?: () => void; square?: boolean }) => (
    <div
      className={`img-tile ${square ? 'img-tile-square' : ''} ${selectedImages.has(id) ? 'img-tile-selected' : ''}`}
      onClick={() => toggleSelect(id)}
      onDoubleClick={() => openLightbox(src)}
    >
      <img src={src} alt="" />
      {selectedImages.has(id) && <div className="img-tile-check">✓</div>}
      {onDelete && <button className="img-tile-del" onClick={e => { e.stopPropagation(); onDelete(); }}>✕</button>}
    </div>
  );

  return (
    <div className="app">
      {/* ── Top Bar ── */}
      <div className="topbar">
        <span className="topbar-logo">ASD STUDIO</span>
        <span className="topbar-divider" />
        <span className="topbar-tag">Shoe Lab</span>
      </div>

      {/* ── Toolbar ── */}
      <div className="toolbar">
        <button type="button" className="toolbar-btn" onClick={() => openModal('model-gen')}>
          <span className="toolbar-btn-icon">◈</span> 모델 생성
        </button>
        <button type="button" className="toolbar-btn" onClick={() => openModal('model-storage')}>
          <span className="toolbar-btn-icon">◇</span> 모델 저장소
          {modelImages.length > 0 && <span className="toolbar-badge">{modelImages.length}</span>}
        </button>
        <button type="button" className="toolbar-btn" onClick={() => openModal('synthesis')}>
          <span className="toolbar-btn-icon">◆</span> 합성
        </button>
      </div>

      {/* ── Canvas ── */}
      <main className="canvas">
        {/* Upload — status only */}
        <div className="upload-card">
          <div className="card-head"><span className="card-title">상품 업로드</span></div>
          <label className={`drop-zone ${isBusy ? 'drop-zone-busy' : ''}`} onDragOver={e => e.preventDefault()} onDrop={handleFileDrop}>
            <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={e => { if (e.target.files) runAutoPipeline(e.target.files); e.target.value = ''; }} />
            {isBusy ? <span className="drop-zone-status">{statusMsg}</span>
              : autoStatus === 'done' ? <span className="drop-zone-status done">{statusMsg}</span>
              : autoStatus === 'error' ? <span className="drop-zone-status error">{statusMsg}</span>
              : <><span className="drop-zone-icon">+</span><span className="drop-zone-text">업로드</span></>}
          </label>
        </div>

        {/* Nukki Storage — small square thumbnails */}
        <div className="storage-card">
          <div className="card-head">
            <span className="card-title">누끼 저장소</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {nukkiFolders.length > 0 && <span className="card-count">{nukkiFolders.length}</span>}
              <button type="button" className="card-head-action" onClick={handleNewFolder} title="새 폴더">+</button>
            </div>
          </div>
          <div className="folder-list">
            {nukkiFolders.length === 0 ? <div className="folder-empty">폴더 없음</div> : nukkiFolders.map((folder, idx) => (
              <div
                key={folder.name}
                className={`folder-item ${dragOverIdx === idx ? 'folder-drag-over' : ''} ${dragIdx === idx ? 'folder-dragging' : ''}`}
                draggable
                onDragStart={() => handleFolderDragStart(idx)}
                onDragOver={e => handleFolderDragOver(e, idx)}
                onDragEnd={handleFolderDragEnd}
                onDrop={e => { e.preventDefault(); handleFolderDragEnd(); }}
              >
                <div className="folder-row" onClick={() => toggleFolder(folder.name)}>
                  <div className="folder-grip" title="드래그하여 순서 변경">⠿</div>
                  <div className="folder-icon">{folder.isOpen ? '▾' : '▸'}</div>
                  {editingFolder === folder.name ? (
                    <input ref={renameInputRef} className="folder-rename-input" value={editName} onChange={e => setEditName(e.target.value)} onBlur={confirmRename} onKeyDown={e => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') setEditingFolder(null); }} onClick={e => e.stopPropagation()} />
                  ) : <span className="folder-name">{folder.name}</span>}
                  <span className="folder-count">{folder.images.length}</span>
                  <button type="button" className="folder-action" onClick={e => { e.stopPropagation(); startRename(folder.name); }}>✎</button>
                </div>
                {folder.isOpen && (
                  <div className="folder-contents">
                    {folder.images.length === 0 ? <div className="folder-empty-inner">이미지 없음</div> : (
                      <div className="folder-square-grid">
                        {folder.images.map(img => (
                          <ImageTile key={img.name} src={img.url} id={`nukki-${folder.name}-${img.name}`} square onDelete={() => handleDeleteNukkiImage(folder.name, img.name)} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </main>

      {/* ══ Modals ══ */}
      {activeModal && (
        <div className="modal-overlay" onClick={() => !isModelGenerating && !isSynthesizing && setActiveModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3 className="modal-title">
                {activeModal === 'model-gen' && '모델 생성'}
                {activeModal === 'model-storage' && '모델 저장소'}
                {activeModal === 'synthesis' && '합성'}
              </h3>
              <button type="button" className="modal-x" onClick={() => setActiveModal(null)}>✕</button>
            </div>
            <div className="modal-body">
              {activeModal === 'model-gen' && (
                <>
                  <div className="m-section">
                    <span className="m-label">스타일 레퍼런스</span>
                    <div className="m-ref-row">
                      {styleRefUrls.map((url, i) => (
                        <div key={i} className="m-ref-thumb">
                          <img src={url} alt="" />
                          <button className="m-ref-remove" onClick={() => setStyleRefUrls(p => p.filter((_, j) => j !== i))}>✕</button>
                        </div>
                      ))}
                      <label className="m-ref-add">
                        <input ref={styleInputRef} type="file" accept="image/*" multiple hidden onChange={e => { handleStyleUpload(e.target.files); e.target.value = ''; }} />+
                      </label>
                    </div>
                  </div>
                  <div className="m-section">
                    <span className="m-label">카테고리</span>
                    <div className="m-cat-row">
                      {MODEL_CATEGORIES.map(cat => (
                        <button key={cat.id} type="button" className={`m-cat-pill ${selectedCategory === cat.id ? 'active' : ''}`} onClick={() => setSelectedCategory(cat.id)}>{cat.label}</button>
                      ))}
                    </div>
                  </div>
                  <button type="button" className="btn-primary" disabled={!styleRefUrls.length || isModelGenerating} onClick={handleGenerateModel}>
                    {isModelGenerating ? modelGenStatus : '모델 생성'}
                  </button>
                </>
              )}
              {activeModal === 'model-storage' && (
                modelImages.length === 0 ? <div className="m-empty">생성된 모델이 없습니다</div> : (
                  <div className="m-image-grid">
                    {modelImages.map(img => (
                      <ImageTile key={img.name} src={img.url} id={`model-${img.name}`} onDelete={async () => { await deleteImage(`models/${img.name}`); loadModelImages(); }} />
                    ))}
                  </div>
                )
              )}
              {activeModal === 'synthesis' && (
                <>
                  {synthStatus && <div className="m-status">{synthStatus}</div>}
                  <div className="m-section">
                    <span className="m-label">누끼 + 모델 → 합성</span>
                    <div className="synth-picker">
                      <div>
                        <div className="synth-header">누끼</div>
                        <div className="synth-grid">
                          {allNukkiImages.map(img => (
                            <div key={`${img.folder}-${img.name}`} className="synth-thumb" onClick={() => { const m = modelImages[0]?.url; if (m) handleSynthesize(img.url, m); else alert('모델을 먼저 생성하세요'); }}>
                              <img src={img.url} alt="" />
                            </div>
                          ))}
                          {!allNukkiImages.length && <div className="synth-empty">없음</div>}
                        </div>
                      </div>
                      <div>
                        <div className="synth-header">모델</div>
                        <div className="synth-grid">
                          {modelImages.map(img => (<div key={img.name} className="synth-thumb"><img src={img.url} alt="" /></div>))}
                          {!modelImages.length && <div className="synth-empty">없음</div>}
                        </div>
                      </div>
                    </div>
                  </div>
                  {synthesisImages.length > 0 && (
                    <div className="m-section">
                      <span className="m-label">결과</span>
                      <div className="m-image-grid">
                        {synthesisImages.map(img => (
                          <ImageTile key={img.name} src={img.url} id={`synth-${img.name}`} onDelete={async () => { await deleteImage(`synthesis/${img.name}`); loadSynthesisImages(); }} />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ Lightbox (Double-click zoom) ══ */}
      {lightboxUrl && (
        <div className="lightbox" onClick={closeLightbox}>
          <img src={lightboxUrl} alt="" />
          <button className="lightbox-close" onClick={closeLightbox}>✕</button>
        </div>
      )}

      <div className="statusbar">
        <span>ASD Studio v0.2</span>
        <span>Supabase · Gemini</span>
      </div>
    </div>
  );
}

export default App;
