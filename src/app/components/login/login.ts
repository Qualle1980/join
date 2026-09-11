import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthFormStateService } from '../../core/services/auth-form-state.service';
import { AuthService } from '../../core/services/auth.service';
import { TaskToastService } from '../../core/services/task-toast.service';
import { currentGreeting } from '../../core/utils/greeting.utils';
import { LoginCard } from './login-card/login-card';
import { SignUpCard } from './sign-up-card/sign-up-card';

/** Which kind of login just succeeded, or `null` while none has. */
export type LoginResult = 'user' | 'guest' | null;
const GREETING_MEDIA_QUERY = '(max-width: 1255px)';

/** Auth page: holds both forms and switches between login, registration and greeting. */
@Component({
    selector: 'app-login',
    standalone: true,
    imports: [RouterLink, LoginCard, SignUpCard],
    templateUrl: './login.html',
    styleUrl: './login.scss',
})
export class Login {
    private readonly authService = inject(AuthService);
    protected readonly taskToastService = inject(TaskToastService);
    private readonly router = inject(Router);
    private readonly formState = inject(AuthFormStateService);

    protected readonly errorMessage = signal('');
    protected readonly isLoading = signal(false);
    protected readonly result = signal<LoginResult>(null);
    protected readonly userName = signal('');
    protected readonly isSignUp = this.formState.isSignUp;
    protected readonly showSplash = this.formState.showSplash;
    protected readonly showLoginPassword = signal(false);
    protected readonly showSignUpPassword = signal(false);
    protected readonly showConfirmPassword = signal(false);

    protected readonly loginForm = this.formState.loginForm;
    protected readonly signUpForm = this.formState.signUpForm;
    protected readonly greetingText = currentGreeting;

    /** Switches to the registration card. */
    protected openSignUp(): void {
        this.errorMessage.set('');
        this.isSignUp.set(true);
    }

    /** Switches back to the login card. */
    protected openLogin(): void {
        this.errorMessage.set('');
        this.isSignUp.set(false);
    }

    /** Validates the login form, signs the user in and confirms it with a toast. */
    protected async submitLogin(): Promise<void> {
        this.errorMessage.set('');
        if (this.isLoginBlocked()) return;
        const { email, password } = this.loginForm.getRawValue();
        const success = await this.runLogin(() => this.authService.login(email, password), 'user');
        if (success) this.taskToastService.login();
    }

    /**
     * Guards the login submit and marks the fields so their errors become visible.
     * @returns `true` when the form is invalid or a request is already running.
     */
    private isLoginBlocked(): boolean {
        if (this.loginForm.valid && !this.isLoading()) return false;
        this.loginForm.markAllAsTouched();
        return true;
    }

    /** Signs in with the shared guest account. */
    protected async loginAsGuest(): Promise<void> {
        if (this.isLoading()) return;
        await this.runLogin(() => this.authService.loginAsGuest(), 'guest');
    }

    /**
     * Runs a sign-in request and handles its loading, error and success states.
     * @param request - Call that performs the sign-in.
     * @param result - Which kind of login this is.
     * @returns `true` when the sign-in succeeded.
     */
    private async runLogin(
        request: () => Promise<string | null>,
        result: 'user' | 'guest',
    ): Promise<boolean> {
        this.startLogin();
        const error = await request();
        this.isLoading.set(false);
        if (error) return this.handleLoginError(error);
        this.completeLogin(result);
        return true;
    }

    /** Marks a sign-in as running and clears the previous error. */
    private startLogin(): void {
        this.isLoading.set(true);
        this.errorMessage.set('');
    }

    /**
     * Shows why the sign-in failed.
     * @param error - Message from the auth service.
     * @returns Always `false`, so callers can hand it straight back.
     */
    private handleLoginError(error: string): false {
        this.errorMessage.set(error);
        return false;
    }

    /**
     * Shows the greeting on narrow screens, or goes straight to the summary.
     * @param result - Which kind of login just succeeded.
     */
    private completeLogin(result: 'user' | 'guest'): void {
        this.userName.set(this.authService.userName());
        if (window.matchMedia(GREETING_MEDIA_QUERY).matches) {
            this.result.set(result);
            return;
        }
        this.finishGreeting();
    }

    /** Validates the registration form, creates the account and confirms it with a toast. */
    protected async submitSignUp(): Promise<void> {
        this.errorMessage.set('');
        const { name, email, password, confirmPassword } = this.signUpForm.getRawValue();
        if (this.isSignUpBlocked(password, confirmPassword)) return;
        const success = await this.registerUser(name, email, password);
        if (success) this.taskToastService.signUp();
    }

    /**
     * Guards the registration submit and marks the fields so their errors become visible.
     * @param password - Chosen password.
     * @param confirmation - Repeated password.
     * @returns `true` when the form is invalid, busy, or the two passwords differ.
     */
    private isSignUpBlocked(password: string, confirmation: string): boolean {
        if (this.signUpForm.valid && !this.isLoading() && password === confirmation) return false;
        this.signUpForm.markAllAsTouched();
        return true;
    }

    /**
     * Creates the account and signs the new user in.
     * @param name - Full name for the profile and the contact entry.
     * @param email - Email address to register.
     * @param password - Chosen password.
     * @returns `true` when the registration succeeded.
     */
    private registerUser(name: string, email: string, password: string): Promise<boolean> {
        return this.runLogin(() => this.authService.signUp({ name, email, password }), 'user');
    }

    /** Hides the splash screen once its animation has run. */
    protected finishSplash(): void {
        this.showSplash.set(false);
    }

    /** Leaves the greeting, empties the forms and opens the summary. */
    protected finishGreeting(): void {
        this.router.navigate(['/summary']).then(() => this.formState.reset());
    }
}
