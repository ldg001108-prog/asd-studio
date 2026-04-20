import { useState, useRef, useEffect, useCallback, memo } from 'react';
import NaverRegisterModal from './components/NaverRegisterModal';
import { generateNukkiShots } from './lib/backgroundRemovalService';
import { generateModelImage, MODEL_CATEGORIES, type ModelCategory } from './lib/modelGeneratorService';
import { synthesizeShoeStudio } from './lib/shoeStudioService';
import { generateDetailPage, assembleDetailPageHTML, type DetailPageResult } from './lib/detailPageService';
import { callGeminiSecure, urlToGeminiPart } from './lib/geminiClient';
import {
  uploadProductImage,
  uploadDataUrl,
  uploadHtmlFile,
  listImages,
  deleteImage,
  listFolders,
  createFolder,
  renameFolder,
  moveImage,
  deleteFolder,
} from './lib/storageService';

// ── Types ──
interface NukkiFolder { name: string; images: { name: string; url: string }[]; isOpen: boolean }
interface SavedImage { name: string; url: string }
type AutoStatus = 'idle' | 'uploading' | 'generating' | 'saving' | 'done' | 'error';
type ModalType = 'model-gen' | 'model-storage' | 'synthesis' | 'detail-13cut' | null;

// ── Image Tile (extracted, memo'd to prevent re-mount on parent render) ──
const ImageTile = memo(({ src, id, selected, square, onSelect, onZoom, onDelete, draggableId }: {
  src: string; id: string; selected: boolean; square?: boolean;
  onSelect: (id: string) => void; onZoom: (url: string) => void; onDelete?: () => void;
  draggableId?: string;
}) => {
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (clickTimer.current) return; // double-click in progress
    clickTimer.current = setTimeout(() => { clickTimer.current = null; onSelect(id); }, 220);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (clickTimer.current) { clearTimeout(clickTimer.current); clickTimer.current = null; }
    onZoom(src);
  };

  return (
    <div
      className={`img-tile ${square ? 'img-tile-square' : ''} ${selected ? 'img-tile-selected' : ''}`}
      onClick={handleClick}
      onDoubleClick={handleDoubleClick}
      draggable={!!draggableId}
      onDragStart={e => {
        if (!draggableId) return;
        // If this tile is selected, include all selected nukki paths
        if (selected) {
          const allSelected = Array.from(document.querySelectorAll('.img-tile-selected[data-drag-id]')).map(el => (el as HTMLElement).dataset.dragId).filter(Boolean) as string[];
          e.dataTransfer.setData('application/x-image-move', allSelected.join('\n'));
        } else {
          e.dataTransfer.setData('application/x-image-move', draggableId);
        }
        e.dataTransfer.effectAllowed = 'move';
      }}
      data-drag-id={draggableId}
    >
      <img src={src} alt="" />
      {selected && <div className="img-tile-check">✓</div>}
      {onDelete && <button className="img-tile-del" onClick={e => { e.stopPropagation(); onDelete(); }}>✕</button>}
    </div>
  );
});

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
  const [selectedNukkis, setSelectedNukkis] = useState<Set<string>>(new Set());
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  // Detail 9-cut
  const [isDetailGenerating, setIsDetailGenerating] = useState(false);
  const [detailStatus, setDetailStatus] = useState('');
  const [detailResults, setDetailResults] = useState<DetailPageResult[]>([]);
  const [detailNukkis, setDetailNukkis] = useState<Set<string>>(new Set());
  const [detailModels, setDetailModels] = useState<Set<string>>(new Set());
  const [detailProductName, setDetailProductName] = useState('Product');
  const [detailFolders, setDetailFolders] = useState<NukkiFolder[]>([]);
  const [templateBlocks, setTemplateBlocks] = useState<{ id: string; type: 'image' | 'html'; src: string; html?: string }[]>(() => {
    try {
      const saved = localStorage.getItem('asd-template-blocks');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [templateDragOver, setTemplateDragOver] = useState(false);
  const [blockDragIdx, setBlockDragIdx] = useState<number | null>(null);
  const [blockDragOverIdx, setBlockDragOverIdx] = useState<number | null>(null);
  const blockInputRef = useRef<HTMLInputElement>(null);
  const htmlBlockInputRef = useRef<HTMLInputElement>(null);
  const [insertAtIdx, setInsertAtIdx] = useState(0);
  const [templateHtml, setTemplateHtml] = useState<string | null>(() => {
    try {
      return localStorage.getItem('asd-template-html') || null;
    } catch { return null; }
  });
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const editIframeRef = useRef<HTMLIFrameElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const styleInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [showNaverModal, setShowNaverModal] = useState(false);
  // AI 이미지 편집
  const [aiEditBlockId, setAiEditBlockId] = useState<string | null>(null);
  const [aiEditPrompt, setAiEditPrompt] = useState('');
  const [isAiEditing, setIsAiEditing] = useState(false);
  const [loadedTemplatePath, setLoadedTemplatePath] = useState<string | null>(() => {
    try { return localStorage.getItem('asd-template-path') || null; } catch { return null; }
  });

  useEffect(() => { loadNukkiFolders(); loadModelImages(); loadDetailFolders(); }, []);

  // ── Auto-save template to localStorage ──
  useEffect(() => {
    try {
      if (templateBlocks.length > 0) {
        localStorage.setItem('asd-template-blocks', JSON.stringify(templateBlocks));
      } else {
        localStorage.removeItem('asd-template-blocks');
      }
    } catch { /* quota exceeded */ }
  }, [templateBlocks]);

  useEffect(() => {
    try {
      if (templateHtml) {
        localStorage.setItem('asd-template-html', templateHtml);
      } else {
        localStorage.removeItem('asd-template-html');
      }
    } catch { /* quota exceeded */ }
  }, [templateHtml]);

  useEffect(() => {
    try {
      if (loadedTemplatePath) {
        localStorage.setItem('asd-template-path', loadedTemplatePath);
      } else {
        localStorage.removeItem('asd-template-path');
      }
    } catch { /* quota exceeded */ }
  }, [loadedTemplatePath]);

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
  const loadDetailFolders = async () => {
    try {
      const folders = await listFolders('detail-13cut');
      const data: NukkiFolder[] = [];
      for (const f of folders) {
        const imgs = await listImages(`detail-13cut/${f}`);
        data.push({ name: f, images: imgs.map(i => ({ name: i.name, url: i.url })), isOpen: false });
      }
      setDetailFolders(data);
    } catch (e) { console.warn('Detail folders load failed:', e); }
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

  // ── Image Move Between Folders ──
  const handleImageDropOnFolder = async (e: React.DragEvent, targetFolder: string, storagePrefix: string) => {
    const moveData = e.dataTransfer.getData('application/x-image-move');
    if (!moveData) return;
    e.preventDefault();
    e.stopPropagation();
    const paths = moveData.split('\n').filter(Boolean);
    const targetPath = `${storagePrefix}/${targetFolder}`;
    try {
      let moved = 0;
      for (const p of paths) {
        const sourceFolder = p.split('/').slice(0, -1).join('/');
        if (sourceFolder === targetPath) continue;
        await moveImage(p, targetPath);
        moved++;
      }
      if (moved > 0) {
        await loadNukkiFolders();
        setSelectedImages(new Set());
      }
    } catch (err: any) { alert(`이동 실패: ${err.message}`); }
  };

  // ── Folder Delete ──
  const handleDeleteFolder = async (folderName: string) => {
    if (!confirm(`'${folderName}' 폴더와 내부 이미지를 모두 삭제하시겠습니까?`)) return;
    try {
      await deleteFolder(`nukki/${folderName}`);
      await loadNukkiFolders();
    } catch (err: any) { alert(`폴더 삭제 실패: ${err.message}`); }
  };

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

  // ── Block Drag Reorder ──
  const handleBlockDragStart = (e: React.DragEvent, idx: number) => {
    setBlockDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleBlockDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (idx !== blockDragIdx) setBlockDragOverIdx(idx);
  };
  const handleBlockDrop = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (blockDragIdx !== null && blockDragIdx !== idx) {
      setTemplateBlocks(prev => {
        const arr = [...prev];
        const [moved] = arr.splice(blockDragIdx, 1);
        arr.splice(idx, 0, moved);
        return arr;
      });
    }
    setBlockDragIdx(null); setBlockDragOverIdx(null);
  };
  const handleBlockDragEnd = () => { setBlockDragIdx(null); setBlockDragOverIdx(null); };

  // ── AI Image Edit ──
  const handleAiEditBlock = async () => {
    if (!aiEditBlockId || !aiEditPrompt.trim() || isAiEditing) return;
    const block = templateBlocks.find(b => b.id === aiEditBlockId);
    if (!block || block.type !== 'image') return;

    setIsAiEditing(true);
    try {
      const imgPart = await urlToGeminiPart(block.src);
      const result = await callGeminiSecure(
        `Edit this image according to the following instruction. Keep everything else EXACTLY the same — same layout, same design, same colors, same style. ONLY change what is specifically requested:\n\n${aiEditPrompt.trim()}`,
        [imgPart],
        { useGemini3Pro: true, temperature: 0.3 },
      );
      if (result.type === 'image') {
        // Upload AI result to Supabase instead of keeping base64
        const url = await uploadDataUrl(result.data, 'detail-edits', 'ai-edit');
        setTemplateBlocks(prev => prev.map(b => b.id === aiEditBlockId ? { ...b, src: url } : b));
        setAiEditBlockId(null);
        setAiEditPrompt('');
      } else {
        alert('이미지 편집 실패: AI가 이미지를 반환하지 않았습니다.');
      }
    } catch (err: any) {
      alert(`AI 편집 실패: ${err.message}`);
    } finally {
      setIsAiEditing(false);
    }
  };

  // ── Model Gen ──
  const handleStyleUpload = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(file => { const r = new FileReader(); r.onloadend = () => setStyleRefUrls(p => [...p, r.result as string]); r.readAsDataURL(file); });
  };
  const handleGenerateModel = async () => {
    if (!styleRefUrls.length || isModelGenerating) return;
    setIsModelGenerating(true);
    const total = styleRefUrls.length;
    let successCount = 0;

    for (let i = 0; i < total; i++) {
      setModelGenStatus(`모델 생성 중 (${i + 1}/${total})...`);
      try {
        const result = await generateModelImage(
          [styleRefUrls[i]],
          selectedCategory,
          msg => setModelGenStatus(`[${i + 1}/${total}] ${msg}`)
        );
        setModelGenStatus(`[${i + 1}/${total}] 저장 중...`);
        await uploadDataUrl(result, 'models', selectedCategory);
        successCount++;
      } catch (e) {
        console.error(`Model ${i + 1} failed:`, e);
        setModelGenStatus(`[${i + 1}/${total}] 실패, 다음 진행...`);
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    await loadModelImages();
    setModelGenStatus(`${successCount}/${total}장 생성 완료`);
    setTimeout(() => { setModelGenStatus(''); setIsModelGenerating(false); }, 2500);
  };

  // ── Synthesis (Batch) ──
  const toggleSynthNukki = (url: string) => setSelectedNukkis(p => { const n = new Set(p); n.has(url) ? n.delete(url) : n.add(url); return n; });
  const toggleSynthModel = (url: string) => setSelectedModels(p => { const n = new Set(p); n.has(url) ? n.delete(url) : n.add(url); return n; });

  const handleBatchSynthesize = async () => {
    if (isSynthesizing || !selectedNukkis.size || !selectedModels.size) return;
    setIsSynthesizing(true);
    const nukkiArr = Array.from(selectedNukkis);
    const modelArr = Array.from(selectedModels);
    const pairs: [string, string][] = [];
    for (const n of nukkiArr) for (const m of modelArr) pairs.push([n, m]);
    const total = pairs.length;
    let successCount = 0;

    for (let i = 0; i < total; i++) {
      setSynthStatus(`합성 중 (${i + 1}/${total})...`);
      try {
        const result = await synthesizeShoeStudio(pairs[i][0], pairs[i][1], 'minimal', false, '2K', msg => setSynthStatus(`[${i + 1}/${total}] ${msg}`));
        setSynthStatus(`[${i + 1}/${total}] 저장 중...`);
        await uploadDataUrl(result, 'synthesis');
        successCount++;
      } catch (e) {
        console.error(`Synthesis ${i + 1} failed:`, e);
        setSynthStatus(`[${i + 1}/${total}] 실패, 다음 진행...`);
        await new Promise(r => setTimeout(r, 1500));
      }
    }

    await loadSynthesisImages();
    setSynthStatus(`${successCount}/${total}장 합성 완료`);
    setSelectedNukkis(new Set()); setSelectedModels(new Set());
    setTimeout(() => { setSynthStatus(''); setIsSynthesizing(false); }, 2500);
  };

  // ── Detail 9-Cut ──
  const toggleDetailNukki = (url: string) => setDetailNukkis(p => { const n = new Set(p); n.has(url) ? n.delete(url) : n.add(url); return n; });
  const toggleDetailModel = (url: string) => setDetailModels(p => { const n = new Set(p); n.has(url) ? n.delete(url) : n.add(url); return n; });

  const handleGenerate13Cut = async () => {
    if (isDetailGenerating || !detailNukkis.size || !detailModels.size) return;
    setIsDetailGenerating(true);
    setDetailResults([]);
    setDetailStatus('준비 중...');
    const sessionFolder = `detail-13cut/${new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-')}`;
    try {
      const nukkiArr = Array.from(detailNukkis);
      const modelArr = Array.from(detailModels);
      const results = await generateDetailPage(
        nukkiArr,
        detailProductName,
        modelArr,
        (msg, current, total) => setDetailStatus(`[${current}/${total}] ${msg}`),
        nukkiArr,
      );
      setDetailResults(results);
      // Build 13-cut HTML (nukki 4 + AI 9 = 13 images in single column) — 개별 이미지 저장 없이 HTML 한 장으로 저장
      setDetailStatus('📄 13컷 HTML 생성 중...');
      const fullHtml = assembleDetailPageHTML(results, detailProductName);
      try {
        await uploadHtmlFile(fullHtml, sessionFolder, '13cut-detail');
      } catch (e) { console.warn('HTML 저장 실패:', e); }
      await loadDetailFolders();
      const aiCount = results.filter(r => r.type === 'image' && r.imageUrl && !r.error).length;
      const nukkiCount = results.filter(r => r.type === 'product_photos' && r.imageUrl).length;
      setDetailStatus(`완료 — 누끼 ${nukkiCount}장 + AI ${aiCount}장 = ${nukkiCount + aiCount}장 HTML 저장 완료`);
    } catch (e) {
      setDetailStatus(`실패: ${e instanceof Error ? e.message : '알 수 없는 오류'}`);
    }
    setIsDetailGenerating(false);
  };

  const openModal = (type: ModalType) => {
    setActiveModal(type);
    if (type === 'model-storage') loadModelImages();
    if (type === 'synthesis') { loadSynthesisImages(); loadModelImages(); loadNukkiFolders(); setSelectedNukkis(new Set()); setSelectedModels(new Set()); }
    if (type === 'detail-13cut') { loadModelImages(); loadNukkiFolders(); setDetailNukkis(new Set()); setDetailModels(new Set()); }
  };

  const isBusy = ['uploading', 'generating', 'saving'].includes(autoStatus);
  const allNukkiImages = nukkiFolders.flatMap(f => f.images.map(i => ({ ...i, folder: f.name })));

  // ImageTile helper props
  const tileSelect = useCallback((id: string) => toggleSelect(id), []);
  const tileZoom = useCallback((url: string) => openLightbox(url), []);

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
        <button type="button" className="toolbar-btn" onClick={() => openModal('detail-13cut')}>
          <span className="toolbar-btn-icon">◈</span> AI 13컷 합성
          {isDetailGenerating && <span className="toolbar-badge pulse-badge">─</span>}
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
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverIdx(idx); }}
                onDragEnd={handleFolderDragEnd}
                onDrop={e => { const md = e.dataTransfer.getData('application/x-image-move'); if (md) { handleImageDropOnFolder(e, folder.name, 'nukki'); } else { e.preventDefault(); handleFolderDragEnd(); } }}
              >
                <div className="folder-row" onClick={() => toggleFolder(folder.name)}>
                  <div className="folder-grip" title="드래그하여 순서 변경">⠿</div>
                  <div className="folder-icon">{folder.isOpen ? '▾' : '▸'}</div>
                  {editingFolder === folder.name ? (
                    <input ref={renameInputRef} className="folder-rename-input" value={editName} onChange={e => setEditName(e.target.value)} onBlur={confirmRename} onKeyDown={e => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') setEditingFolder(null); }} onClick={e => e.stopPropagation()} />
                  ) : <span className="folder-name">{folder.name}</span>}
                  <span className="folder-count">{folder.images.length}</span>
                  <button type="button" className="folder-action" onClick={e => { e.stopPropagation(); startRename(folder.name); }}>✎</button>
                  <button type="button" className="folder-action" style={{ color: '#e74c3c' }} onClick={e => { e.stopPropagation(); handleDeleteFolder(folder.name); }} title="폴더 삭제">🗑</button>
                </div>
                {folder.isOpen && (
                  <div className="folder-contents">
                    {folder.images.length === 0 ? <div className="folder-empty-inner">이미지 없음</div> : (
                      <div className="folder-square-grid">
                        {folder.images.map(img => (
                          <ImageTile key={img.name} src={img.url} id={`nukki-${folder.name}-${img.name}`} selected={selectedImages.has(`nukki-${folder.name}-${img.name}`)} square onSelect={tileSelect} onZoom={tileZoom} onDelete={() => handleDeleteNukkiImage(folder.name, img.name)} draggableId={`nukki/${folder.name}/${img.name}`} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Detail 13-Cut Storage — HTML only */}
        <div className="storage-card">
          <div className="card-head">
            <span className="card-title">13컷 저장소</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {detailFolders.length > 0 && <span className="card-count">{detailFolders.length}</span>}
            </div>
          </div>
          <div className="folder-list">
            {detailFolders.length === 0 ? <div className="folder-empty">생성된 13컷 없음</div> : detailFolders.map(folder => {
              const htmlFiles = folder.images.filter(img => img.name.endsWith('.html'));
              if (htmlFiles.length === 0) return null;
              return (
                <div key={folder.name} className="folder-item">
                  {htmlFiles.map(html => (
                    <div
                      key={html.name}
                      className="html-list-item"
                      draggable
                      onDragStart={e => e.dataTransfer.setData('text/plain', html.url)}
                      onClick={async () => {
                        try {
                          const res = await fetch(html.url + '?t=' + Date.now(), { cache: 'no-store' });
                          const text = await res.text();
                          const parser = new DOMParser();
                          const doc = parser.parseFromString(text, 'text/html');
                          const imgs = Array.from(doc.querySelectorAll('img'));
                          setTemplateBlocks(imgs.map((img, i) => ({ id: `b${Date.now()}-${i}`, type: 'image' as const, src: img.getAttribute('src') || '' })));
                          setLoadedTemplatePath(`detail-13cut/${folder.name}/${html.name}`);
                        } catch (e) { console.error('HTML load failed:', e); }
                      }}
                      title="클릭하여 편집기에 로드"
                    >
                      <span className="html-list-icon">📄</span>
                      <span className="html-list-name">{folder.name}</span>
                      <button className="html-list-del" onClick={async (e) => { e.stopPropagation(); await deleteImage(`detail-13cut/${folder.name}/${html.name}`); loadDetailFolders(); }}>✕</button>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* Detail Page Template Canvas — Block Editor */}
        <div
          className={`template-canvas${templateDragOver ? ' template-drag-over' : ''}`}
          onDragOver={e => { e.preventDefault(); setTemplateDragOver(true); }}
          onDragLeave={() => setTemplateDragOver(false)}
          onDrop={async e => {
            e.preventDefault();
            setTemplateDragOver(false);
            const url = e.dataTransfer.getData('text/plain');
            if (!url) return;
            try {
              const res = await fetch(url);
              const text = await res.text();
              const parser = new DOMParser();
              const doc = parser.parseFromString(text, 'text/html');
              const imgs = Array.from(doc.querySelectorAll('img'));
              setTemplateBlocks(imgs.map((img, i) => ({ id: `b${Date.now()}-${i}`, type: 'image' as const, src: img.getAttribute('src') || '' })));
              setLoadedTemplatePath(null);
            } catch (e) { console.error('HTML drop failed:', e); }
          }}
        >
          <div className="card-head">
            <span className="card-title">상세페이지 템플릿</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {/* Block mode buttons */}
              {templateBlocks.length > 0 && <span className="card-count">{templateBlocks.length}장</span>}
              {templateBlocks.length > 0 && (
                <button className="card-head-action" title="네이버 스마트스토어 등록" style={{ background: '#03c75a', color: '#fff', borderRadius: 6, fontWeight: 800, fontSize: 11, padding: '2px 6px', border: 'none', cursor: 'pointer' }} onClick={() => setShowNaverModal(true)}>N</button>
              )}
              {templateBlocks.length > 0 && (
                <button className="card-head-action" title="새 탭에서 미리보기" onClick={() => {
                  // Collect HTML from all blocks (image + html iframe)
                  const blockContents = templateBlocks.map((b) => {
                    if (b.type === 'html') {
                      const iframe = document.querySelector(`iframe[data-block-id="${b.id}"]`) as HTMLIFrameElement | null;
                      if (iframe?.contentDocument) {
                        return iframe.contentDocument.documentElement.outerHTML;
                      }
                      return b.html || '';
                    }
                    return `<img src="${b.src}" style="width:100%;display:block" />`;
                  });
                  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>상세페이지</title><style>body{margin:0;padding:0;background:#fff} .c{max-width:860px;margin:0 auto} .c img{width:100%;display:block}</style></head><body><div class="c">${blockContents.join('\n')}</div></body></html>`;
                  const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
                  window.open(URL.createObjectURL(blob), '_blank');
                }}>↗</button>
              )}
              {templateBlocks.length > 0 && (
                 <button className="card-head-action" title="HTML 저장" onClick={async () => {
                  const blockContents = templateBlocks.map((b) => {
                    if (b.type === 'html') {
                      const iframe = document.querySelector(`iframe[data-block-id="${b.id}"]`) as HTMLIFrameElement | null;
                      if (iframe?.contentDocument) {
                        return iframe.contentDocument.documentElement.outerHTML;
                      }
                      return b.html || '';
                    }
                    return `<img src="${b.src}" style="width:100%;display:block" />`;
                  });
                  const html = `<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${detailProductName} - 상세페이지</title><style>body{margin:0;padding:0;background:#fff} .c{max-width:860px;margin:0 auto} .c img{width:100%;display:block}</style></head><body><div class="c">${blockContents.join('\n')}</div></body></html>`;
                  try {
                    if (loadedTemplatePath) {
                      // Overwrite existing template
                      const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
                      const { createClient } = await import('@supabase/supabase-js');
                      const supabase = createClient(
                        import.meta.env.VITE_SUPABASE_URL || '',
                        import.meta.env.VITE_SUPABASE_KEY || ''
                      );
                      const bucket = import.meta.env.VITE_SUPABASE_BUCKET || 'shoe-studio-generated';
                      const { error } = await supabase.storage.from(bucket).upload(loadedTemplatePath, blob, {
                        contentType: 'text/html; charset=utf-8',
                        upsert: true,
                      });
                      if (error) throw error;
                    } else {
                      // New template
                      const folder = `detail-13cut/${new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-')}`;
                      await uploadHtmlFile(html, folder, '13cut-detail');
                    }
                    await loadDetailFolders();
                    alert('✅ 상세페이지 저장 완료!');
                  } catch (e) {
                    console.error('Save failed:', e);
                    alert('❌ 저장 실패: ' + (e as Error).message);
                  }
                }}>💾</button>
              )}
              {templateBlocks.length > 0 && <button className="card-head-action" title="초기화" onClick={() => { setTemplateBlocks([]); setLoadedTemplatePath(null); }}>✕</button>}
              {/* HTML edit mode buttons */}
              {templateHtml && (
                <button className="card-head-action" title="새 탭에서 미리보기" onClick={() => {
                  const iframe = editIframeRef.current;
                  const html = iframe?.contentDocument?.documentElement.outerHTML || templateHtml;
                  const blob = new Blob([`<!DOCTYPE html>${html}`], { type: 'text/html; charset=utf-8' });
                  window.open(URL.createObjectURL(blob), '_blank');
                }}>↗</button>
              )}
              {templateHtml && (
                <button className="card-head-action" title="HTML 저장" onClick={async () => {
                  const iframe = editIframeRef.current;
                  const html = iframe?.contentDocument?.documentElement.outerHTML || templateHtml;
                  const folder = `detail-13cut/${new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-')}`;
                  try {
                    await uploadHtmlFile(`<!DOCTYPE html>${html}`, folder, '13cut-detail');
                    await loadDetailFolders();
                    setDetailStatus('✅ HTML 저장 완료');
                    alert('✅ 상세페이지 HTML 저장 완료!');
                  } catch (e) {
                    console.error('Save failed:', e);
                    alert('❌ 저장 실패: ' + (e as Error).message);
                  }
                }}>💾</button>
              )}
              {templateHtml && <button className="card-head-action" title="초기화" onClick={() => setTemplateHtml(null)}>✕</button>}
              {/* Paste HTML button (always visible when no content) */}
              {!templateBlocks.length && !templateHtml && (
                <button className="card-head-action" title="HTML 붙여넣기" onClick={() => setShowPasteModal(true)}>📋</button>
              )}
            </div>
          </div>
          <div className="template-body">
            {/* Hidden file inputs for block insertion */}
            <input
              type="file"
              accept="image/*"
              ref={blockInputRef}
              style={{ display: 'none' }}
              onChange={async e => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const url = await uploadProductImage(file);
                  setTemplateBlocks(prev => {
                    const next = [...prev];
                    next.splice(insertAtIdx, 0, { id: `b${Date.now()}`, type: 'image', src: url });
                    return next;
                  });
                } catch (err: any) {
                  alert(`이미지 업로드 실패: ${err.message}`);
                }
                e.target.value = '';
              }}
            />
            <input
              type="file"
              accept=".html,.htm"
              ref={htmlBlockInputRef}
              style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  const html = reader.result as string;
                  setTemplateBlocks(prev => {
                    const next = [...prev];
                    next.splice(insertAtIdx, 0, { id: `h${Date.now()}`, type: 'html', src: '', html });
                    return next;
                  });
                };
                reader.readAsText(file);
                e.target.value = '';
              }}
            />
             {templateBlocks.length > 0 ? (
              <div className="block-editor">
                {/* Insert buttons at top */}
                <div className="block-insert-group">
                  <button className="block-insert-btn" onClick={() => { setInsertAtIdx(0); blockInputRef.current?.click(); }}>🖼 이미지 추가</button>
                  <button className="block-insert-btn" onClick={() => { setInsertAtIdx(0); htmlBlockInputRef.current?.click(); }}>📄 HTML 추가</button>
                </div>
                {templateBlocks.map((block, idx) => (
                  <div
                    key={block.id}
                    className={`block-wrapper${blockDragIdx === idx ? ' block-dragging' : ''}${blockDragOverIdx === idx && blockDragIdx !== idx ? ' block-drag-over' : ''}`}
                    onDragOver={e => handleBlockDragOver(e, idx)}
                    onDrop={e => handleBlockDrop(e, idx)}
                    onDragEnd={handleBlockDragEnd}
                  >
                    <div className="block-item">
                      {/* Drag handle — always visible, only THIS element is draggable */}
                      <div
                        className="block-drag-handle"
                        title="드래그하여 순서 변경"
                        draggable
                        onDragStart={e => handleBlockDragStart(e, idx)}
                      >⠿</div>
                      <div className="block-content">
                        {block.type === 'html' ? (
                          <iframe
                            className="block-html-iframe"
                            data-block-id={block.id}
                            srcDoc={block.html}
                            title={`HTML 블록 ${idx + 1}`}
                            onLoad={e => {
                              const iframe = e.currentTarget;
                              const doc = iframe.contentDocument;
                              if (doc) {
                                doc.designMode = 'on';
                                const resize = () => {
                                  const h = doc.documentElement.scrollHeight;
                                  iframe.style.height = h + 'px';
                                };
                                resize();
                                new MutationObserver(resize).observe(doc.body, { childList: true, subtree: true, characterData: true });
                              }
                            }}
                          />
                        ) : (
                          <img src={block.src} alt={`블록 ${idx + 1}`} className="block-img" />
                        )}
                      </div>
                      <div className="block-actions">
                        <span className="block-badge">{idx + 1}</span>
                        {block.type === 'image' && (
                          <button
                            className="block-ai-edit"
                            title="AI로 텍스트/이미지 편집"
                            onClick={() => { setAiEditBlockId(block.id); setAiEditPrompt(''); }}
                          >✏️</button>
                        )}
                        <button className="block-del" onClick={() => setTemplateBlocks(prev => prev.filter(b => b.id !== block.id))}>✕</button>
                      </div>
                      {/* AI Edit prompt inline */}
                      {aiEditBlockId === block.id && (
                        <div className="ai-edit-overlay">
                          {isAiEditing ? (
                            <div className="ai-edit-loading">🤖 AI 편집 중...</div>
                          ) : (
                            <div className="ai-edit-form">
                              <input
                                className="ai-edit-input"
                                placeholder="예: 글씨를 '배러밸류'로 변경"
                                value={aiEditPrompt}
                                onChange={e => setAiEditPrompt(e.target.value)}
                                onKeyDown={e => { if (e.key === 'Enter') handleAiEditBlock(); }}
                                autoFocus
                              />
                              <button className="ai-edit-submit" onClick={handleAiEditBlock} disabled={!aiEditPrompt.trim()}>적용</button>
                              <button className="ai-edit-cancel" onClick={() => setAiEditBlockId(null)}>취소</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {/* Insert buttons between blocks */}
                    <div className="block-insert-group">
                      <button className="block-insert-btn" onClick={() => { setInsertAtIdx(idx + 1); blockInputRef.current?.click(); }}>🖼 이미지 추가</button>
                      <button className="block-insert-btn" onClick={() => { setInsertAtIdx(idx + 1); htmlBlockInputRef.current?.click(); }}>📄 HTML 추가</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : templateHtml ? (
              <iframe
                ref={editIframeRef}
                className="template-iframe"
                title="HTML 편집기"
                srcDoc={templateHtml}
                onLoad={() => {
                  const iframe = editIframeRef.current;
                  if (iframe?.contentDocument) {
                    iframe.contentDocument.designMode = 'on';
                  }
                }}
              />
            ) : (
              <div className="template-empty">
                <span className="template-empty-icon">📋</span>
                <span className="template-empty-text">13컷 저장소에서 드래그/클릭 또는<br/>HTML 붙여넣기로 시작하세요</span>
                <button className="paste-html-btn" onClick={() => setShowPasteModal(true)}>📋 HTML 붙여넣기</button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* ══ Paste HTML Modal ══ */}
      {showPasteModal && (
        <div className="modal-overlay" onClick={() => setShowPasteModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px' }}>
            <div className="modal-head">
              <h3 className="modal-title">HTML 붙여넣기</h3>
              <button className="modal-close" onClick={() => setShowPasteModal(false)}>✕</button>
            </div>
            <div style={{ padding: '16px' }}>
              <textarea
                className="paste-textarea"
                placeholder="나노바나나에서 생성된 HTML 코드를 붙여넣으세요..."
                value={pasteText}
                onChange={e => setPasteText(e.target.value)}
                rows={16}
              />
              <button
                className="paste-apply-btn"
                disabled={!pasteText.trim()}
                onClick={() => {
                  setTemplateHtml(pasteText);
                  setTemplateBlocks([]);
                  setShowPasteModal(false);
                  setPasteText('');
                }}
              >적용하여 편집 시작</button>
            </div>
          </div>
        </div>
      )}
      {activeModal && (
        <div className="modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-head">
              <h3 className="modal-title">
                {activeModal === 'model-gen' && '모델 생성'}
                {activeModal === 'model-storage' && '모델 저장소'}
                {activeModal === 'synthesis' && '합성'}
                {activeModal === 'detail-13cut' && 'AI 13컷 합성'}
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
                  {modelGenStatus && (
                    <div className={`m-progress ${!isModelGenerating ? 'm-progress-done' : ''}`}>
                      {modelGenStatus}
                    </div>
                  )}
                  <button type="button" className="btn-primary" disabled={!styleRefUrls.length || isModelGenerating} onClick={handleGenerateModel}>
                    {isModelGenerating ? `생성 중...` : '모델 생성'}
                  </button>
                </>
              )}
              {activeModal === 'model-storage' && (
                modelImages.length === 0 ? <div className="m-empty">생성된 모델이 없습니다</div> : (
                  <div className="m-image-grid">
                    {modelImages.map(img => (
                      <ImageTile key={img.name} src={img.url} id={`model-${img.name}`} selected={selectedImages.has(`model-${img.name}`)} onSelect={tileSelect} onZoom={tileZoom} onDelete={async () => { await deleteImage(`models/${img.name}`); loadModelImages(); }} />
                    ))}
                  </div>
                )
              )}
              {activeModal === 'synthesis' && (
                <>
                  {synthStatus && <div className="m-status">{synthStatus}</div>}
                  <div className="m-section">
                    <span className="m-label">누끼 선택 ({selectedNukkis.size}장)</span>
                    <div className="synth-grid">
                      {allNukkiImages.map(img => {
                        const key = img.url;
                        return (
                          <div key={`${img.folder}-${img.name}`} className={`synth-thumb ${selectedNukkis.has(key) ? 'synth-thumb-selected' : ''}`} onClick={() => toggleSynthNukki(key)}>
                            <img src={img.url} alt="" />
                            {selectedNukkis.has(key) && <div className="synth-check">✓</div>}
                          </div>
                        );
                      })}
                      {!allNukkiImages.length && <div className="synth-empty">없음</div>}
                    </div>
                  </div>
                  <div className="m-section">
                    <span className="m-label">모델 선택 ({selectedModels.size}장)</span>
                    <div className="synth-grid">
                      {modelImages.map(img => {
                        const key = img.url;
                        return (
                          <div key={img.name} className={`synth-thumb ${selectedModels.has(key) ? 'synth-thumb-selected' : ''}`} onClick={() => toggleSynthModel(key)}>
                            <img src={img.url} alt="" />
                            {selectedModels.has(key) && <div className="synth-check">✓</div>}
                          </div>
                        );
                      })}
                      {!modelImages.length && <div className="synth-empty">없음</div>}
                    </div>
                  </div>
                  <button type="button" className="btn-primary" disabled={!selectedNukkis.size || !selectedModels.size || isSynthesizing} onClick={handleBatchSynthesize}>
                    {isSynthesizing ? synthStatus : `합성 시작 (${selectedNukkis.size} × ${selectedModels.size} = ${selectedNukkis.size * selectedModels.size}장)`}
                  </button>
                  {synthesisImages.length > 0 && (
                    <div className="m-section">
                      <span className="m-label">결과 ({synthesisImages.length}장)</span>
                      <div className="m-image-grid">
                        {synthesisImages.map(img => (
                          <ImageTile key={img.name} src={img.url} id={`synth-${img.name}`} selected={selectedImages.has(`synth-${img.name}`)} onSelect={tileSelect} onZoom={tileZoom} onDelete={async () => { await deleteImage(`synthesis/${img.name}`); loadSynthesisImages(); }} />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
              {activeModal === 'detail-13cut' && (
                <>
                  <div className="m-section">
                    <span className="m-label">상품명</span>
                    <input
                      className="m-input"
                      type="text"
                      value={detailProductName}
                      onChange={e => setDetailProductName(e.target.value)}
                      placeholder="예: 블랙 레더 더비슈즈"
                    />
                  </div>
                  <div className="m-section">
                    <span className="m-label">누끼 선택 ({detailNukkis.size}장)</span>
                    <div className="synth-grid">
                      {allNukkiImages.map(img => {
                        const key = img.url;
                        return (
                          <div key={`d13-n-${img.folder}-${img.name}`} className={`synth-thumb ${detailNukkis.has(key) ? 'synth-thumb-selected' : ''}`} onClick={() => toggleDetailNukki(key)}>
                            <img src={img.url} alt="" />
                            {detailNukkis.has(key) && <div className="synth-check">✓</div>}
                          </div>
                        );
                      })}
                      {!allNukkiImages.length && <div className="synth-empty">누끼 없음</div>}
                    </div>
                  </div>
                  <div className="m-section">
                    <span className="m-label">모델 선택 ({detailModels.size}장)</span>
                    <div className="synth-grid">
                      {modelImages.map(img => {
                        const key = img.url;
                        return (
                          <div key={`d13-m-${img.name}`} className={`synth-thumb ${detailModels.has(key) ? 'synth-thumb-selected' : ''}`} onClick={() => toggleDetailModel(key)}>
                            <img src={img.url} alt="" />
                            {detailModels.has(key) && <div className="synth-check">✓</div>}
                          </div>
                        );
                      })}
                      {!modelImages.length && <div className="synth-empty">모델 없음</div>}
                    </div>
                  </div>
                  {detailStatus && (
                    <div className={`m-progress ${!isDetailGenerating ? 'm-progress-done' : ''}`}>
                      {detailStatus}
                    </div>
                  )}
                  <button type="button" className="btn-primary" disabled={!detailNukkis.size || !detailModels.size || isDetailGenerating} onClick={handleGenerate13Cut}>
                    {isDetailGenerating ? '생성 중...' : `AI 13컷 생성 (누끼 ${detailNukkis.size} + AI 9장)`}
                  </button>
                  {detailResults.filter(r => (r.type === 'image' || r.type === 'product_photos') && r.imageUrl && !r.error).length > 0 && (
                    <div className="m-section">
                      <span className="m-label">결과 ({detailResults.filter(r => (r.type === 'image' || r.type === 'product_photos') && r.imageUrl && !r.error).length}장)</span>
                      <div className="m-image-grid">
                        {detailResults.filter(r => (r.type === 'image' || r.type === 'product_photos') && r.imageUrl && !r.error).map((r, i) => (
                          <ImageTile key={`d13r-${i}`} src={r.imageUrl!} id={`d13-result-${i}`} selected={false} onSelect={() => {}} onZoom={tileZoom} />
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
        {isModelGenerating && (
          <span className="statusbar-task" onClick={() => openModal('model-gen')}>
            <span className="statusbar-dot pulse" /> {modelGenStatus}
          </span>
        )}
        {isSynthesizing && (
          <span className="statusbar-task" onClick={() => openModal('synthesis')}>
            <span className="statusbar-dot pulse" /> {synthStatus}
          </span>
        )}
        {isDetailGenerating && (
          <span className="statusbar-task" onClick={() => openModal('detail-13cut')}>
            <span className="statusbar-dot pulse" /> {detailStatus}
          </span>
        )}
        {!isModelGenerating && !isSynthesizing && !isDetailGenerating && <span>Supabase · Gemini</span>}
      </div>

      <NaverRegisterModal
        visible={showNaverModal}
        onClose={() => setShowNaverModal(false)}
        images={templateBlocks.filter(b => b.type === 'image').map(b => b.src)}
        detailHtml={(() => {
          const contents = templateBlocks.map((b) => {
            if (b.type === 'html') {
              const iframe = document.querySelector(`iframe[data-block-id="${b.id}"]`) as HTMLIFrameElement | null;
              if (iframe?.contentDocument) return iframe.contentDocument.documentElement.outerHTML;
              return b.html || '';
            }
            return `<img src="${b.src}" style="width:100%;display:block" />`;
          });
          return contents.join('\n');
        })()}
        productName={detailProductName}
      />
    </div>
  );
}

export default App;
