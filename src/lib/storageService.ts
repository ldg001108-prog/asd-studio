/**
 * Supabase Storage Service
 * 모든 이미지를 Supabase Storage에 저장/로드
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || '';
const BUCKET = import.meta.env.VITE_SUPABASE_BUCKET || 'shoe-studio-generated';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ==================== 유틸 ====================

function generatePath(folder: string, ext = 'png'): string {
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `${folder}/${ts}-${rand}.${ext}`;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'image/png';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

// ==================== 업로드 ====================

/** File 객체를 Supabase에 업로드하고 public URL 반환 */
export async function uploadProductImage(file: File): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = generatePath('products', ext);

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    });

  if (error) throw new Error(`업로드 실패: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** data URL (base64)을 Supabase에 업로드하고 public URL 반환 */
export async function uploadDataUrl(
  dataUrl: string,
  folder: string,
  label?: string,
): Promise<string> {
  const blob = dataUrlToBlob(dataUrl);
  const ext = blob.type.includes('jpeg') ? 'jpg' : 'png';
  const path = label
    ? `${folder}/${label}-${Date.now()}.${ext}`
    : generatePath(folder, ext);

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, blob, {
      contentType: blob.type,
      upsert: false,
    });

  if (error) throw new Error(`업로드 실패: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// ==================== 목록 조회 ====================

/** 특정 폴더의 파일 목록 (public URL 포함) */
export async function listImages(folder: string): Promise<
  { name: string; url: string; createdAt: string }[]
> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(folder, {
      limit: 100,
      sortBy: { column: 'created_at', order: 'desc' },
    });

  if (error) throw new Error(`목록 조회 실패: ${error.message}`);

  return (data || [])
    .filter((f) => !f.name.startsWith('.'))
    .map((f) => {
      const { data: urlData } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(`${folder}/${f.name}`);
      return {
        name: f.name,
        url: urlData.publicUrl,
        createdAt: f.created_at || '',
      };
    });
}

// ==================== 폴더 관리 ====================

/** 특정 경로 하위의 폴더 목록 반환 */
export async function listFolders(prefix: string): Promise<string[]> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(prefix, { limit: 100 });

  if (error) throw new Error(`폴더 조회 실패: ${error.message}`);

  return (data || [])
    .filter((item) => item.id === null) // 폴더는 id가 null
    .map((item) => item.name);
}

/** 빈 폴더 생성 (placeholder 파일 업로드) */
export async function createFolder(path: string): Promise<void> {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(`${path}/.keep`, new Blob([''], { type: 'text/plain' }), {
      upsert: true,
    });

  if (error) throw new Error(`폴더 생성 실패: ${error.message}`);
}

/** 폴더 이름 변경 (모든 파일을 새 경로로 복사 후 원본 삭제) */
export async function renameFolder(
  parentPath: string,
  oldName: string,
  newName: string,
): Promise<void> {
  const oldPath = `${parentPath}/${oldName}`;
  const newPath = `${parentPath}/${newName}`;

  // 기존 파일 목록
  const { data: files } = await supabase.storage
    .from(BUCKET)
    .list(oldPath, { limit: 200 });

  if (!files || files.length === 0) {
    // 빈 폴더면 새 폴더 생성만
    await createFolder(newPath);
    return;
  }

  // 파일 복사 → 구 파일 삭제
  for (const file of files) {
    const oldFilePath = `${oldPath}/${file.name}`;
    const newFilePath = `${newPath}/${file.name}`;

    // 다운로드
    const { data: blob } = await supabase.storage
      .from(BUCKET)
      .download(oldFilePath);

    if (blob) {
      await supabase.storage
        .from(BUCKET)
        .upload(newFilePath, blob, { upsert: true });

      await supabase.storage.from(BUCKET).remove([oldFilePath]);
    }
  }
}

// ==================== 삭제 ====================

/** 파일 삭제 */
export async function deleteImage(fullPath: string): Promise<void> {
  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([fullPath]);

  if (error) throw new Error(`삭제 실패: ${error.message}`);
}

/** URL에서 storage path 추출 */
export function urlToPath(publicUrl: string): string {
  const marker = `/object/public/${BUCKET}/`;
  const idx = publicUrl.indexOf(marker);
  if (idx === -1) return publicUrl;
  return publicUrl.slice(idx + marker.length);
}
