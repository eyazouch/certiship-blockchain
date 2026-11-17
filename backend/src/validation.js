import { getAddress, isAddress } from 'viem';
import { HttpError } from './errors.js';

export const ROLES = ['ADMIN', 'SUPPLIER', 'OPERATOR'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TX_HASH_RE = /^0x[0-9a-fA-F]{64}$/;

function text(value, field, { min = 1, max, required = true } = {}) {
  if (value === undefined || value === null) {
    if (!required) return '';
    throw new HttpError(400, `Le champ « ${field} » est obligatoire`);
  }
  if (typeof value !== 'string') throw new HttpError(400, `Le champ « ${field} » doit être un texte`);
  // Normalisation : suppression des caractères de contrôle (hors retours à la ligne) et des espaces de bord
  const v = value.normalize('NFC').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
  if (v.length < min) throw new HttpError(400, `Le champ « ${field} » est obligatoire`);
  if (max && v.length > max) throw new HttpError(400, `Le champ « ${field} » dépasse ${max} caractères`);
  return v;
}

export function validateProductInput(body = {}) {
  return {
    name: text(body.name, 'nom', { max: 120 }),
    category: text(body.category, 'catégorie', { max: 60 }),
    description: text(body.description, 'description', { min: 0, max: 2000, required: false }),
  };
}

export function validateWallet(value, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new HttpError(400, 'Adresse de portefeuille obligatoire pour ce rôle');
    return null;
  }
  if (typeof value !== 'string' || !isAddress(value, { strict: false })) {
    throw new HttpError(400, 'Adresse de portefeuille invalide');
  }
  return getAddress(value);
}

export function validateUserInput(body = {}, { partial = false } = {}) {
  const out = {};
  if (!partial || body.name !== undefined) out.name = text(body.name, 'nom', { max: 100 });
  if (!partial || body.email !== undefined) {
    const email = text(body.email, 'email', { max: 200 }).toLowerCase();
    if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Email invalide');
    out.email = email;
  }
  if (!partial || body.password !== undefined) {
    if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 200) {
      throw new HttpError(400, 'Le mot de passe doit contenir au moins 8 caractères');
    }
    out.password = body.password;
  }
  if (!partial || body.role !== undefined) {
    if (!ROLES.includes(body.role)) throw new HttpError(400, 'Rôle invalide');
    out.role = body.role;
  }
  if (body.walletAddress !== undefined) out.walletAddress = validateWallet(body.walletAddress);
  if (body.active !== undefined) out.active = Boolean(body.active);
  return out;
}

export function validateTxHash(value) {
  if (typeof value !== 'string' || !TX_HASH_RE.test(value)) throw new HttpError(400, 'Hash de transaction invalide');
  return value.toLowerCase();
}

export function validateProductNumber(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1) throw new HttpError(400, 'Numéro de produit invalide');
  return n;
}
