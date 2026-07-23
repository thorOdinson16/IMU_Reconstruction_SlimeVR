import type { UserProfile, ActivityType, Gender } from '../platform';
import { createProfile, updateProfile, deleteProfile, getAllProfiles, getProfile, getActiveProfile, setActiveProfile } from '../platform';
import { icon } from './icons';

const ACTIVITY_LABELS: Record<ActivityType, string> = { general: 'General', physiotherapy: 'Physiotherapy', athlete: 'Athlete', yoga: 'Yoga', gym: 'Gym' };
const GENDERS: Gender[] = ['male', 'female', 'other', 'prefer-not-to-say'];
const GENDER_LABELS: Record<Gender, string> = { male: 'Male', female: 'Female', other: 'Other', 'prefer-not-to-say': 'Prefer not to say' };

export type ProfileEditorMode = 'create' | 'edit' | 'list';

export class ProfileEditor {
  readonly element: HTMLElement;
  private nameInput: HTMLInputElement;
  private ageInput: HTMLInputElement;
  private heightInput: HTMLInputElement;
  private weightInput: HTMLInputElement;
  private genderSelect: HTMLSelectElement;
  private activitySelect: HTMLSelectElement;
  private notesInput: HTMLTextAreaElement;
  private saveBtn: HTMLButtonElement;
  private cancelBtn: HTMLButtonElement;
  private deleteBtn: HTMLButtonElement;
  private form: HTMLElement;
  private profileList: HTMLElement;
  private editorTitle: HTMLElement;
  private currentProfileId: string | null = null;
  private onDone: (() => void) | null = null;

  constructor() {
    this.element = document.createElement('div');
    this.element.className = 'profile-editor';
    this.element.innerHTML = `
      <div class="pe-header">
        <span class="eyebrow accent">Profiles</span>
        <h2 data-pe-title>User Profiles</h2>
      </div>

      <div class="pe-profile-list" data-pe-list></div>

      <div class="pe-form" data-pe-form style="display:none">
        <div class="pe-field">
          <label>Name</label>
          <input type="text" data-pe-name placeholder="e.g. Alex Chen" />
        </div>
        <div class="pe-row">
          <div class="pe-field">
            <label>Age</label>
            <input type="number" data-pe-age min="1" max="150" />
          </div>
          <div class="pe-field">
            <label>Height (cm)</label>
            <input type="number" data-pe-height min="50" max="250" step="0.5" />
          </div>
          <div class="pe-field">
            <label>Weight (kg)</label>
            <input type="number" data-pe-weight min="10" max="300" step="0.1" />
          </div>
        </div>
        <div class="pe-row">
          <div class="pe-field">
            <label>Gender</label>
            <select data-pe-gender></select>
          </div>
          <div class="pe-field">
            <label>Activity Type</label>
            <select data-pe-activity></select>
          </div>
        </div>
        <div class="pe-field">
          <label>Notes</label>
          <textarea data-pe-notes rows="3" placeholder="Optional notes about this user..."></textarea>
        </div>
        <div class="pe-actions">
          <button class="pe-btn pe-btn-primary" data-pe-save>${icon('spark')}<span>Save Profile</span></button>
          <button class="pe-btn pe-btn-secondary" data-pe-cancel>Cancel</button>
          <button class="pe-btn pe-btn-danger" data-pe-delete style="display:none">${icon('pulse')}<span>Delete Profile</span></button>
        </div>
      </div>`;

    this.form = this.element.querySelector<HTMLElement>('[data-pe-form]')!;
    this.profileList = this.element.querySelector<HTMLElement>('[data-pe-list]')!;
    this.editorTitle = this.element.querySelector<HTMLElement>('[data-pe-title]')!;
    this.nameInput = this.element.querySelector<HTMLInputElement>('[data-pe-name]')!;
    this.ageInput = this.element.querySelector<HTMLInputElement>('[data-pe-age]')!;
    this.heightInput = this.element.querySelector<HTMLInputElement>('[data-pe-height]')!;
    this.weightInput = this.element.querySelector<HTMLInputElement>('[data-pe-weight]')!;
    this.genderSelect = this.element.querySelector<HTMLSelectElement>('[data-pe-gender]')!;
    this.activitySelect = this.element.querySelector<HTMLSelectElement>('[data-pe-activity]')!;
    this.notesInput = this.element.querySelector<HTMLTextAreaElement>('[data-pe-notes]')!;
    this.saveBtn = this.element.querySelector<HTMLButtonElement>('[data-pe-save]')!;
    this.cancelBtn = this.element.querySelector<HTMLButtonElement>('[data-pe-cancel]')!;
    this.deleteBtn = this.element.querySelector<HTMLButtonElement>('[data-pe-delete]')!;

    this.genderSelect.innerHTML = `<option value="">— Select —</option>${GENDERS.map((g) => `<option value="${g}">${GENDER_LABELS[g]}</option>`).join('')}`;
    this.activitySelect.innerHTML = Object.entries(ACTIVITY_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');

    this.element.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const profileCard = t.closest<HTMLElement>('[data-pe-card]');
      if (t.closest('[data-pe-new]')) this.showForm('create');
      else if (t.closest('[data-pe-card-select]') && profileCard) this.selectProfile(profileCard.dataset.peCard!);
      else if (t.closest('[data-pe-card-edit]') && profileCard) this.editProfile(profileCard.dataset.peCard!);
      else if (t.closest('[data-pe-save]')) this.save();
      else if (t.closest('[data-pe-cancel]')) this.showList();
      else if (t.closest('[data-pe-delete]')) this.remove();
    });

    this.showList();
  }

  setOnDone(fn: () => void): void { this.onDone = fn; }

  destroy(): void { this.element.remove(); }

  showList(): void {
    this.form.style.display = 'none';
    this.renderList();
  }

  showForm(mode: ProfileEditorMode, profileId?: string): void {
    this.form.style.display = 'block';
    this.currentProfileId = profileId ?? null;
    this.editorTitle.textContent = mode === 'create' ? 'New Profile' : 'Edit Profile';
    this.deleteBtn.style.display = mode === 'edit' ? 'flex' : 'none';
    this.saveBtn.innerHTML = `${icon('spark')}<span>${mode === 'create' ? 'Create Profile' : 'Save Changes'}</span>`;

    if (mode === 'edit' && profileId) {
      const p = getProfile(profileId);
      if (p) this.populateForm(p);
    } else {
      this.resetForm();
    }
  }

  private selectProfile(id: string): void {
    setActiveProfile(id);
    this.renderList();
    this.onDone?.();
  }

  private editProfile(id: string): void {
    this.showForm('edit', id);
  }

  private populateForm(p: UserProfile): void {
    this.nameInput.value = p.name;
    this.ageInput.value = String(p.age);
    this.heightInput.value = String(p.heightCm);
    this.weightInput.value = String(p.weightKg);
    this.genderSelect.value = p.gender ?? '';
    this.activitySelect.value = p.activityType;
    this.notesInput.value = p.notes;
  }

  private resetForm(): void {
    this.nameInput.value = '';
    this.ageInput.value = '30';
    this.heightInput.value = '170';
    this.weightInput.value = '70';
    this.genderSelect.value = '';
    this.activitySelect.value = 'general';
    this.notesInput.value = '';
  }

  private save(): void {
    const name = this.nameInput.value.trim();
    if (!name) { this.nameInput.focus(); return; }
    const data = {
      name,
      age: parseInt(this.ageInput.value) || 30,
      heightCm: parseFloat(this.heightInput.value) || 170,
      weightKg: parseFloat(this.weightInput.value) || 70,
      gender: (this.genderSelect.value || null) as Gender | null,
      activityType: this.activitySelect.value as ActivityType,
      notes: this.notesInput.value.trim(),
    };
    if (this.currentProfileId) {
      updateProfile(this.currentProfileId, data);
    } else {
      const profile = createProfile(data);
      setActiveProfile(profile.id);
    }
    this.showList();
    this.onDone?.();
  }

  private remove(): void {
    if (!this.currentProfileId) return;
    if (!confirm('Delete this profile and all associated data?')) return;
    deleteProfile(this.currentProfileId);
    const remaining = getAllProfiles();
    if (remaining.length > 0) setActiveProfile(remaining[0].id);
    this.showList();
  }

  private renderList(): void {
    const profiles = getAllProfiles();
    const active = getActiveProfile();
    if (profiles.length === 0) {
      this.profileList.innerHTML = `<div class="pe-empty"><span class="eyebrow">No profiles yet</span><p>Create a profile to start tracking sessions and progress.</p><button class="pe-btn pe-btn-primary" data-pe-new>${icon('plus')}<span>Create Profile</span></button></div>`;
      return;
    }
    this.profileList.innerHTML = `<div class="pe-cards">${profiles.map((p) => {
      const isActive = active?.id === p.id;
      return `<div class="pe-card ${isActive ? 'pe-card-active' : ''}" data-pe-card="${p.id}">
        <div class="pe-card-avatar" style="background:hsl(${(p.avatarSeed * 137.5) % 360},55%,45%)">${p.name.charAt(0).toUpperCase()}</div>
        <div class="pe-card-info">
          <strong>${p.name}</strong>
          <span>${p.age} yrs · ${p.heightCm}cm · ${ACTIVITY_LABELS[p.activityType]}</span>
        </div>
        <div class="pe-card-actions">
          ${isActive ? '<span class="pe-active-badge">Active</span>' : `<button class="pe-card-btn" data-pe-card-select title="Switch to this profile">${icon('chevron')}</button>`}
          <button class="pe-card-btn" data-pe-card-edit title="Edit profile">${icon('settings')}</button>
        </div>
      </div>`;
    }).join('')}</div>
    <button class="pe-btn pe-btn-secondary" data-pe-new style="margin-top:8px">${icon('plus')}<span>Add Profile</span></button>`;
  }
}
