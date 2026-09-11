import { Component, OnInit, computed, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { TasksService } from '../../core/services/tasks.service';
import { UrgentHighlightService } from '../../core/services/urgent-highlight.service';
import { TaskToastService } from '../../core/services/task-toast.service';
import { currentGreeting } from '../../core/utils/greeting.utils';

/** Dashboard with the task counters, the next urgent deadline and the greeting. */
@Component({
    selector: 'app-summary',
    standalone: true,
    imports: [RouterLink],
    templateUrl: './summary.html',
    styleUrl: './summary.scss',
})
export class Summary implements OnInit {
    private readonly tasksService = inject(TasksService);
    protected readonly taskToastService = inject(TaskToastService);
    private readonly urgentHighlightService = inject(UrgentHighlightService);
    private readonly router = inject(Router);
    private readonly authService = inject(AuthService);

    readonly currentUserName = computed(() =>
        this.authService.isGuest() ? null : this.authService.userName(),
    );

    readonly greetingText = currentGreeting;

    private readonly tasks = this.tasksService.tasks;

    readonly todoCount = computed(() => this.tasks().filter((t) => t.status === 'todo').length);
    readonly doneCount = computed(() => this.tasks().filter((t) => t.status === 'done').length);
    readonly inProgressCount = computed(
        () => this.tasks().filter((t) => t.status === 'in-progress').length,
    );
    readonly awaitFeedbackCount = computed(
        () => this.tasks().filter((t) => t.status === 'await-feedback').length,
    );
    readonly totalTasksInBoard = computed(() => this.tasks().length);

    private readonly urgentTasks = computed(() =>
        this.tasks().filter((t) => t.priority === 'urgent'),
    );
    readonly urgentCount = computed(() => this.urgentTasks().length);

    private readonly nextUrgentDeadline = computed(() => {
        const dates = this.urgentTasks()
            .map((t) => t.dueDate)
            .filter(Boolean)
            .sort();
        return dates.length ? dates[0] : null;
    });

    readonly formattedDeadline = computed(() => {
        const date = this.nextUrgentDeadline();
        if (!date) return '—';
        return new Date(date).toLocaleDateString('en-US', {
            month: 'long',
            day: 'numeric',
            year: 'numeric',
        });
    });

    /** Loads the tasks the counters are derived from. */
    ngOnInit(): void {
        this.tasksService.loadTasks();
    }

    /** Opens the board and asks it to highlight the urgent tasks. */
    onUrgentClick(): void {
        this.urgentHighlightService.trigger();
        this.router.navigate(['/board']);
    }

}
