import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  getNaverStatus,
  searchCategories,
  getCategoryAttributes,
  registerFull,
  registerProduct,
  validateCategoryUsability,
} from './naver-api.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const app = express();
const PORT = process.env.SERVER_PORT || 13003;

app.use(cors());
app.use(express.json({ limit: '100mb' }));

/* ── Naver API Routes ── */
app.get('/api/naver/status', (_req, res) => {
  res.json(getNaverStatus());
});

app.get('/api/naver/categories/:keyword', async (req, res) => {
  try {
    const categories = await searchCategories(req.params.keyword);
    res.json(categories);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/naver/categories/:id/attributes', async (req, res) => {
  try {
    const attrs = await getCategoryAttributes(req.params.id);
    res.json({ data: attrs });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/naver/categories/:id/validate', async (req, res) => {
  try {
    const { image, name, detailContent } = req.body || {};
    const result = await validateCategoryUsability({
      leafCategoryId: req.params.id,
      image,
      name: name || '테스트 상품',
      detailContent,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/naver/register-full', async (req, res) => {
  try {
    const result = await registerFull(req.body);
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.post('/api/naver/register', async (req, res) => {
  try {
    const result = await registerProduct(req.body);
    res.json(result);
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`\nASD Studio 서버 시작: http://localhost:${PORT}`);
  console.log(`   네이버 API: ${getNaverStatus().configured ? '설정됨' : '미설정'}`);
  console.log('');
});
