import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { ContactForm } from './contact-form';
import { ContactsService } from '../../../core/services/contacts.service';

describe('ContactForm', () => {
  let component: ContactForm;
  let fixture: ComponentFixture<ContactForm>;
  const serviceError = signal<string | null>(null);
  const contactsService = {
    error: serviceError.asReadonly(),
    addContact: vi.fn(),
    updateContact: vi.fn(),
    deleteContact: vi.fn(),
    contactDetailExists: vi.fn(),
  };

  beforeEach(async () => {
    serviceError.set(null);
    vi.clearAllMocks();
    await TestBed.configureTestingModule({
      imports: [ContactForm],
      providers: [{ provide: ContactsService, useValue: contactsService }],
    }).compileComponents();

    fixture = TestBed.createComponent(ContactForm);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it.each([
    ['Email already exists.', 'email'],
    ['Phone number already exists.', 'phone'],
  ] as const)('keeps the form open and reports %s', async (message, field) => {
    serviceError.set(message);
    contactsService.addContact.mockResolvedValue(null);
    const failed = vi.fn();
    const closed = vi.fn();
    component.saveFailed.subscribe(failed);
    component.closed.subscribe(closed);
    component.form.setValue({
      name: 'Test Person',
      email: 'test@example.com',
      phone: '+4915799999999',
    });

    await component.onSubmit();

    expect(component.form.controls[field].hasError('duplicate')).toBe(true);
    expect(failed).toHaveBeenCalledWith(message);
    expect(closed).not.toHaveBeenCalled();
  });

  it.each([
    ['email', 'Email already exists.'],
    ['phone', 'Phone number already exists.'],
  ] as const)('reports a duplicate %s when the field loses focus', async (field, message) => {
    contactsService.contactDetailExists.mockResolvedValue(true);
    const failed = vi.fn();
    component.saveFailed.subscribe(failed);
    component.form.setValue({
      name: 'Test Person',
      email: 'test@example.com',
      phone: '+4915799999999',
    });

    await component.checkDuplicate(field);

    expect(component.form.controls[field].hasError('duplicate')).toBe(true);
    expect(failed).toHaveBeenCalledWith(message);
  });

  it('does not show a duplicate error for an unused email address', async () => {
    contactsService.contactDetailExists.mockResolvedValue(false);
    const failed = vi.fn();
    component.saveFailed.subscribe(failed);
    component.form.setValue({
      name: 'Test Person',
      email: 'unused@example.com',
      phone: '+4915799999999',
    });

    await component.checkDuplicate('email');

    expect(component.form.controls.email.hasError('duplicate')).toBe(false);
    expect(failed).not.toHaveBeenCalled();
  });
});
