import { computed, inject, Injectable, signal } from '@angular/core';
import { Contact, ContactGroup, ContactInput, ContactUpdate, NewContact } from '../models/contact.model';
import { createAvatarColor } from '../utils/avatar.utils';
import { groupContactsByLetter, sortContactsByName } from '../utils/contact-list.utils';
import { SupabaseService } from './supabase.service';

const TABLE = 'contacts';
const DUPLICATE_ERROR_CODE = '23505';
const DUPLICATE_EMAIL_MESSAGE = 'Email already exists.';
const DUPLICATE_PHONE_MESSAGE = 'Phone number already exists.';
export type UniqueContactField = 'email' | 'phone';

interface ContactRequestError {
  code?: string;
  message: string;
  details?: string;
  hint?: string;
}

/** Loads and edits the contacts and keeps them sorted and grouped by letter. */
@Injectable({ providedIn: 'root' })
export class ContactsService {
  private readonly supabase = inject(SupabaseService).client;
  private readonly contactsSignal = signal<Contact[]>([]);
  private readonly loadingSignal = signal(false);
  private readonly errorSignal = signal<string | null>(null);

  readonly contacts = computed(() => sortContactsByName(this.contactsSignal()));
  readonly groups = computed<ContactGroup[]>(() => groupContactsByLetter(this.contacts()));
  readonly loading = this.loadingSignal.asReadonly();
  readonly error = this.errorSignal.asReadonly();

  /** Reloads all contacts from Supabase into the signal. */
  async loadContacts(): Promise<void> {
    this.startRequest();
    const { data, error } = await this.supabase.from(TABLE).select('*');
    if (error) {
      this.failRequest(error.message);
      return;
    }
    this.contactsSignal.set((data ?? []) as Contact[]);
    this.loadingSignal.set(false);
  }

  /**
   * Creates a contact, assigning an avatar color when none is given.
   * @param input - Contact values from the form.
   * @returns Created contact, or `null` when the insert failed.
   */
  async addContact(input: ContactInput): Promise<Contact | null> {
    this.startRequest();
    const contact: NewContact = { ...input, color: input.color ?? this.nextAvatarColor() };
    const { data, error } = await this.supabase.from(TABLE).insert(contact).select().single();
    if (error) {
      this.failRequest(this.contactErrorMessage(error));
      return null;
    }
    await this.loadContacts();
    return data as Contact;
  }

  /**
   * Applies changes to one contact.
   * @param id - Id of the contact to change.
   * @param changes - Fields to overwrite.
   * @returns Updated contact, or `null` when the update failed.
   */
  async updateContact(id: number, changes: ContactUpdate): Promise<Contact | null> {
    this.startRequest();
    const { data, error } = await this.supabase.from(TABLE).update(changes)
      .eq('id', id)
      .select()
      .single();
    if (error) {
      this.failRequest(this.contactErrorMessage(error));
      return null;
    }
    await this.loadContacts();
    return data as Contact;
  }

  /**
   * Deletes one contact.
   * @param id - Id of the contact to delete.
   * @returns `true` when a row was removed, `false` when it was blocked or failed.
   */
  async deleteContact(id: number): Promise<boolean> {
    this.startRequest();
    const { data, error } = await this.supabase.from(TABLE).delete().eq('id', id).select();
    if (error) {
      this.failRequest(error.message);
      return false;
    }
    if (!data || data.length === 0) {
      this.failRequest('This Contact could not be deleted.');
      return false;
    }
    await this.loadContacts();
    return true;
  }

  /**
   * Assigns a contact to a user account.
   * @param id - Id of the contact to claim.
   * @param userId - Supabase user id to link.
   */
  async claimContact(id: number, userId: string): Promise<void> {
    await this.updateContact(id, { user_id: userId });
  }

  /**
   * Looks up a loaded contact by id.
   * @param id - Contact id.
   * @returns Matching contact, or `undefined` when it is not loaded.
   */
  findById(id: number): Contact | undefined {
    return this.contactsSignal().find((contact) => contact.id === id);
  }

  /**
   * Checks whether an email address or phone number is already assigned to another contact.
   * @param field - Contact detail to compare.
   * @param value - Current form value.
   * @param excludedId - Contact ignored while editing an existing entry.
   * @returns `true` when another contact already uses the normalized value.
   */
  async contactDetailExists(
    field: UniqueContactField,
    value: string,
    excludedId?: number,
  ): Promise<boolean> {
    let query = this.supabase.from(TABLE).select('id, email, phone');
    if (excludedId !== undefined) query = query.neq('id', excludedId);

    const { data, error } = await query;
    if (error) {
      this.failRequest(error.message);
      return false;
    }

    const expected = this.normalizeContactDetail(field, value);
    return (data ?? []).some((contact) =>
      this.normalizeContactDetail(field, contact[field]) === expected,
    );
  }

  /**
   * Picks an avatar color that stands apart from the ones in use.
   * @returns Hex color for the next contact.
   */
  private nextAvatarColor(): string {
    return createAvatarColor(this.contactsSignal().map((contact) => contact.color));
  }

  /**
   * Converts database uniqueness errors into messages suitable for the contact form.
   * @param error - Error returned by Supabase.
   * @returns Specific duplicate message or the original database message.
   */
  private contactErrorMessage(error: ContactRequestError): string {
    if (error.code !== DUPLICATE_ERROR_CODE) return error.message;

    const context = `${error.message} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase();
    if (context.includes('phone')) return DUPLICATE_PHONE_MESSAGE;
    if (context.includes('email')) return DUPLICATE_EMAIL_MESSAGE;
    return 'Contact already exists.';
  }

  /** Normalizes a contact detail before a uniqueness comparison. */
  private normalizeContactDetail(field: UniqueContactField, value: string): string {
    return field === 'email' ? value.trim().toLowerCase() : value.replace(/\D/g, '');
  }

  /** Marks a request as running and clears the previous error. */
  private startRequest(): void {
    this.loadingSignal.set(true);
    this.errorSignal.set(null);
  }

  /**
   * Stores an error message and ends the running request.
   * @param message - Text to show in the UI.
   */
  private failRequest(message: string): void {
    this.errorSignal.set(message);
    this.loadingSignal.set(false);
  }
}
