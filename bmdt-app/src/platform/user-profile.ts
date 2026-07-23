import { loadJSON, saveJSON, listKeys, removeItem } from './store';

export type ActivityType = 'general' | 'physiotherapy' | 'athlete' | 'yoga' | 'gym';
export type Gender = 'male' | 'female' | 'other' | 'prefer-not-to-say';

export interface UserProfile {
  id: string;
  name: string;
  age: number;
  heightCm: number;
  weightKg: number;
  gender: Gender | null;
  activityType: ActivityType;
  avatarSeed: number;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

const PROFILES_KEY = 'user_profiles';
const ACTIVE_KEY = 'user_active';

function seed(): number {
  return Math.floor(Math.random() * 1000);
}

export function createProfile(data: Omit<UserProfile, 'id' | 'avatarSeed' | 'createdAt' | 'updatedAt'>): UserProfile {
  const profile: UserProfile = { ...data, id: crypto.randomUUID?.() ?? `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, avatarSeed: seed(), createdAt: Date.now(), updatedAt: Date.now() };
  save();
  return profile;
}

export function updateProfile(id: string, patch: Partial<Omit<UserProfile, 'id' | 'createdAt'>>): UserProfile | null {
  const profiles = getAllProfiles();
  const idx = profiles.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  profiles[idx] = { ...profiles[idx], ...patch, updatedAt: Date.now() };
  saveJSON(PROFILES_KEY, profiles);
  return profiles[idx];
}

export function deleteProfile(id: string): void {
  const profiles = getAllProfiles().filter((p) => p.id !== id);
  saveJSON(PROFILES_KEY, profiles);
  const active = getActiveProfile();
  if (active?.id === id) removeItem(ACTIVE_KEY);
}

export function getAllProfiles(): UserProfile[] {
  return loadJSON<UserProfile[]>(PROFILES_KEY) ?? [];
}

export function getProfile(id: string): UserProfile | null {
  return getAllProfiles().find((p) => p.id === id) ?? null;
}

export function getActiveProfile(): UserProfile | null {
  const id = loadJSON<string>(ACTIVE_KEY);
  return id ? getProfile(id) : null;
}

export function setActiveProfile(id: string): void {
  saveJSON(ACTIVE_KEY, id);
}

function save(): void {
  const profiles = getAllProfiles();
  saveJSON(PROFILES_KEY, profiles);
}

export function hasAnyProfiles(): boolean {
  return getAllProfiles().length > 0;
}

export function getProfileCount(): number {
  return getAllProfiles().length;
}
