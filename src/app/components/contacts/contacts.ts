import { Component, computed, ElementRef, inject, OnInit, signal, Renderer2, ViewChild } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { ContactList } from './contact-list/contact-list';
import { ContactDetail } from './contact-detail/contact-detail';
import { ContactForm } from './contact-form/contact-form';
import { Router } from '@angular/router';
import { Contact } from '../../core/models/contact.model';
import { AuthService } from '../../core/services/auth.service';
import { ContactsService } from '../../core/services/contacts.service';

/** Contacts page: list, detail view, add and edit form, and the delete rules. */
@Component({
    selector: 'app-contacts',
    standalone: true,
    imports: [ContactList, ContactDetail, ContactForm],
    templateUrl: './contacts.html',
    styleUrl: './contacts.scss',
})
export class Contacts implements OnInit {
    @ViewChild(ContactDetail, { read: ElementRef }) private contactDetail?: ElementRef<HTMLElement>;

    private contactsService = inject(ContactsService);
    private authService = inject(AuthService);
    private router = inject(Router);
    private renderer = inject(Renderer2);
    private document = inject(DOCUMENT);

    selectedContact = signal<Contact | null>(null);
    contactSelectionVersion = signal(0);
    showForm = signal(false);
    editingContact = signal<Contact | null>(null);
    showToast = signal(false);
    toastMessage = signal('');

    readonly detailLocked = computed(() => this.isLocked(this.selectedContact()));

    /** Loads the contacts the list is built from. */
    ngOnInit(): void {
        this.contactsService.loadContacts();
    }

    /**
     * Opens a contact in the detail view and scrolls the page back to the top.
     * @param contact - Contact picked from the list.
     */
    onContactSelected(contact: Contact): void {
        this.selectedContact.set(contact);
        this.contactSelectionVersion.update((version) => version + 1);
        if (this.contactSelectionVersion() > 1) this.restartDetailAnimation();
        this.document.defaultView?.scrollTo({ top: 0, behavior: 'smooth' });
    }

    /** Replays the slide-in of the detail view when it is already on screen. */
    private restartDetailAnimation(): void {
        this.document.defaultView?.requestAnimationFrame(() => {
            const detail =
                this.contactDetail?.nativeElement.querySelector<HTMLElement>('.contact-detail');
            if (!detail) return;
            detail.getAnimations().forEach((animation) => animation.cancel());
            detail.animate([{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }], {
                duration: 300,
                easing: 'cubic-bezier(0, 0, 0.58, 1)',
            });
        });
    }

    /** Closes the detail view and returns to the list on narrow screens. */
    onBackToList(): void {
        this.selectedContact.set(null);
        this.contactSelectionVersion.set(0);
    }

    /** Opens the form for a new contact and locks the page behind the modal. */
    openAddForm(): void {
        this.editingContact.set(null);
        this.showForm.set(true);
        this.renderer.addClass(this.document.body, 'modal-open');
    }

    /**
     * Opens the form for an existing contact; ignored while the contact is locked.
     * @param contact - Contact to edit.
     */
    openEditForm(contact: Contact): void {
        if (this.isLocked(contact)) return;
        this.editingContact.set(contact);
        this.showForm.set(true);
        this.renderer.addClass(this.document.body, 'modal-open');
    }

    /**
     * Deletes a contact from the detail view and signs the user out when it was their own.
     * @param contact - Contact to delete.
     */
    async onDeleteContact(contact: Contact): Promise<void> {
        if (this.isLocked(contact)) return;
        const success = await this.contactsService.deleteContact(contact.id);
        if (!success) {
            this.showToastMessage('Something went wrong');
            return;
        }
        if (this.selectedContact()?.id === contact.id) {
            this.selectedContact.set(null);
        }
        if (await this.logoutIfOwnContact(contact)) return;
        this.showToastMessage('Contact deleted');
    }

    /** Reacts to a delete made inside the form and signs the user out when it was their own contact. */
    async onFormDeleted(): Promise<void> {
        const deleted = this.editingContact();
        this.selectedContact.set(null);
        if (deleted && (await this.logoutIfOwnContact(deleted))) return;
        this.showToastMessage('Contact deleted');
    }

    /**
     * Reports whether a contact is off limits for editing and deleting.
     * @param contact - Contact to check, or `null`.
     * @returns `true` for dummy contacts and for contacts owned by someone else.
     */
    private isLocked(contact: Contact | null): boolean {
        if (!contact) return false;
        if (contact.is_protected) return true;
        return !!contact.user_id && contact.user_id !== this.authService.user()?.id;
    }

    /**
     * Signs the user out when the deleted contact was their own.
     * @param contact - Contact that was deleted.
     * @returns `true` when the user was signed out.
     */
    private async logoutIfOwnContact(contact: Contact): Promise<boolean> {
        const email = this.authService.user()?.email?.toLowerCase();
        if (!email || contact.email.toLowerCase() !== email) return false;
        await this.authService.logout();
        this.router.navigate(['/login']);
        return true;
    }

    /**
     * Shows a toast and hides it again after 2.5 seconds.
     * @param message - Text to display.
     */
    private showToastMessage(message: string): void {
        this.toastMessage.set(message);
        this.showToast.set(true);
        setTimeout(() => this.showToast.set(false), 2500);
    }

    /** Plays the closing animation of the modal, then resets the form. */
    closeForm(): void {
        const modal = this.document.querySelector('.contacts__modal');
        if (modal) {
            this.renderer.addClass(modal, 'contacts__modal--closing');
            setTimeout(() => this.resetForm(), 300);
        } else {
            this.resetForm();
        }
    }

    /** Hides the form and unlocks the page behind the modal. */
    private resetForm(): void {
        this.showForm.set(false);
        this.editingContact.set(null);
        this.renderer.removeClass(this.document.body, 'modal-open');
    }

    /**
     * Closes the form and reports the outcome in a toast.
     * @param contact - Saved contact, or `null` when saving failed.
     */
    async onFormSaved(contact: Contact | null): Promise<void> {
        this.showForm.set(false);
        this.editingContact.set(null);
        this.renderer.removeClass(this.document.body, 'modal-open');
        if (contact) {
            this.selectedContact.set(contact);
            await this.syncOwnName(contact);
        }
        this.showToastMessage(contact ? 'Contact saved' : 'Something went wrong');
    }

    /**
     * Displays a save error while leaving the contact form open for correction.
     * @param message - Specific reason the contact could not be saved.
     */
    onFormSaveFailed(message: string): void {
        this.showToastMessage(message);
    }

    /**
     * Copies the name into the account when the saved contact belongs to the signed-in user.
     * @param contact - Contact that was just saved.
     */
    private async syncOwnName(contact: Contact): Promise<void> {
        if (!contact.user_id || contact.user_id !== this.authService.user()?.id) return;
        await this.authService.updateName(contact.name);
    }
}
