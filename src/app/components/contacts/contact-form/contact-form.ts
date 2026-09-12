import { Component, inject, input, output, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ContactsService } from '../../../core/services/contacts.service';
import { Contact } from '../../../core/models/contact.model';
import { getInitials } from '../../../core/utils/avatar.utils';
import { EMAIL_PATTERN, fullNameValidator } from '../../../core/utils/validation.utils';

/** Form for adding and editing a contact, including deletion in edit mode. */
@Component({
    selector: 'app-contact-form',
    standalone: true,
    imports: [CommonModule, ReactiveFormsModule],
    templateUrl: './contact-form.html',
    styleUrl: './contact-form.scss',
})
export class ContactForm implements OnInit {
    private fb = inject(FormBuilder);
    private contactsService = inject(ContactsService);

    editingContact = input<Contact | null>(null);
    closed = output<void>();
    saved = output<Contact | null>();
    saveFailed = output<string>();
    deleted = output<void>();

    isSubmitting = false;
    deleteConfirmOpen = signal(false);
    deleteError = signal<string | null>(null);

    readonly maxLengths = { name: 40, email: 80, phone: 20 };

    form = this.fb.group({
        name: ['', [Validators.required, Validators.maxLength(40), fullNameValidator]],
        email: ['', [Validators.required, Validators.maxLength(80), Validators.pattern(EMAIL_PATTERN)]],
        phone: ['', [Validators.required, Validators.maxLength(20), Validators.pattern(/^\+?[0-9]+$/)]],
    });

    /**
     * Reports whether a field has reached its character limit.
     * @param field - Field to check.
     * @returns `true` when no further characters fit.
     */
    atLimit(field: 'name' | 'email' | 'phone'): boolean {
        return (this.form.value[field] ?? '').length >= this.maxLengths[field];
    }

    /** `true` while the form still matches the contact being edited. */
    get isUnchanged(): boolean {
        const contact = this.editingContact();
        if (!contact) return false;
        const { name, email, phone } = this.form.value;
        return name === contact.name && email === contact.email && phone === contact.phone;
    }

    /** `true` when the form edits an existing contact rather than creating one. */
    get isEditMode(): boolean {
        return this.editingContact() !== null;
    }

    /** Fills the form with the contact being edited. */
    ngOnInit(): void {
        const contact = this.editingContact();
        if (contact) {
            this.form.patchValue({
                name: contact.name,
                email: contact.email,
                phone: contact.phone,
            });
        }
    }

    /** Initials shown in the avatar while editing. */
    get initials(): string {
        return getInitials(this.editingContact()?.name ?? '');
    }

    /** Validates the form, saves the contact and reports the outcome to the page. */
    async onSubmit(): Promise<void> {
        if (this.submissionBlocked()) return;

        this.isSubmitting = true;
        const contact = this.editingContact();
        const result = await this.saveContact(contact);
        this.isSubmitting = false;
        if (!result) {
            this.handleSaveFailure();
            return;
        }
        this.form.reset();
        this.saved.emit(result);
        this.closed.emit();
    }

    /**
     * Guards the submit and marks the fields so their errors become visible.
     * @returns `true` when the form is invalid and submitting must stop.
     */
    private submissionBlocked(): boolean {
        if (this.form.valid) return false;
        this.form.markAllAsTouched();
        return true;
    }

    /**
     * Creates or updates the contact, depending on the mode.
     * @param contact - Contact being edited, or `null` when creating one.
     * @returns Saved contact, or `null` when the request failed.
     */
    private saveContact(contact: Contact | null): Promise<Contact | null> {
        const { name, email, phone } = this.form.value;
        const input = { name: name!, email: email!, phone: phone! };
        return contact
            ? this.contactsService.updateContact(contact.id, input)
            : this.contactsService.addContact(input);
    }

    /** Keeps the form open, marks the duplicate field and requests an error toast. */
    private handleSaveFailure(): void {
        const message = this.contactsService.error() ?? 'Something went wrong';
        if (message === 'Email already exists.') {
            this.form.controls.email.setErrors({ duplicate: true });
        }
        if (message === 'Phone number already exists.') {
            this.form.controls.phone.setErrors({ duplicate: true });
        }
        this.saveFailed.emit(message);
    }

    /** Closes the form without saving. */
    onCancel(): void {
        this.closed.emit();
    }

    /** Opens the delete confirmation. */
    onDeleteClick(): void {
        this.deleteError.set(null);
        this.deleteConfirmOpen.set(true);
    }

    /** Closes the delete confirmation and clears its error. */
    cancelDelete(): void {
        this.deleteConfirmOpen.set(false);
        this.deleteError.set(null);
    }

    /** Deletes the contact being edited and keeps the form open when it fails. */
    async confirmDelete(): Promise<void> {
        const contact = this.editingContact();
        if (!contact) return;

        try {
            const success = await this.contactsService.deleteContact(contact.id);
            this.handleDeleteResult(success);
        } catch {
            this.deleteError.set('Something went wrong');
        }
    }

    /**
     * Closes the form after a delete, or shows why it was refused.
     * @param success - Whether the delete removed a row.
     */
    private handleDeleteResult(success: boolean): void {
        if (!success) {
            this.deleteError.set(this.contactsService.error());
            return;
        }
        this.deleteConfirmOpen.set(false);
        this.deleteError.set(null);
        this.deleted.emit();
        this.closed.emit();
    }
}
