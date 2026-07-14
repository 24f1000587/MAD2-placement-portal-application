import api, { errorMessage } from '../api.js';
import { authStore, logout, hasRole } from '../store.js';
import { toastStore, pushToast } from '../toast.js';

const { reactive, onMounted, computed } = Vue;

/* ---------------------------------------------------------------------------
 * StatusRail — the signature "track" component. Renders the journey of an
 * application as a segmented rail with a highlighted current stage.
 * ------------------------------------------------------------------------- */
export const StatusRail = {
  name: 'StatusRail',
  props: { status: { type: String, required: true } },
  template: `
    <div class="pt-rail">
      <div
        v-for="(step, idx) in steps"
        :key="step.key"
        class="pt-rail-step"
        :class="stepClass(idx)"
      >
        <div class="pt-rail-dot"></div>
        <span>{{ step.label }}</span>
      </div>
    </div>
  `,
  setup(props) {
    const order = ['applied', 'shortlisted', 'interview_scheduled', 'selected'];
    const steps = [
      { key: 'applied', label: 'Applied' },
      { key: 'shortlisted', label: 'Shortlisted' },
      { key: 'interview_scheduled', label: 'Interview' },
      { key: 'selected', label: 'Selected' },
    ];
    const isRejected = computed(() => props.status === 'rejected');
    const currentIdx = computed(() => order.indexOf(props.status));

    function stepClass(idx) {
      if (isRejected.value) {
        return idx === 0 ? 'pt-rail-done' : idx === currentIdx.value ? '' : '';
      }
      if (idx < currentIdx.value) return 'pt-rail-done';
      if (idx === currentIdx.value) return 'pt-rail-current';
      return '';
    }
    return { steps, stepClass };
  },
};

/* ---------------------------------------------------------------------------
 * StatusBadge — small pill used everywhere a status string appears.
 * ------------------------------------------------------------------------- */
export const StatusBadge = {
  name: 'StatusBadge',
  props: { status: { type: String, required: true } },
  template: `<span class="pt-badge" :class="'pt-badge-' + status">{{ label }}</span>`,
  computed: {
    label() {
      return (this.status || '').replace(/_/g, ' ');
    },
  },
};

/* ---------------------------------------------------------------------------
 * Toast stack
 * ------------------------------------------------------------------------- */
export const ToastStack = {
  name: 'ToastStack',
  template: `
    <div class="pt-toast-stack">
      <div v-for="t in toastStore.items" :key="t.id"
           class="toast show align-items-center border-0"
           :class="t.variant === 'error' ? 'text-bg-danger' : 'text-bg-dark'">
        <div class="d-flex">
          <div class="toast-body">{{ t.message }}</div>
        </div>
      </div>
    </div>
  `,
  setup() {
    return { toastStore };
  },
};

/* ---------------------------------------------------------------------------
 * Notification bell (dropdown) — polls /api/common/notifications
 * ------------------------------------------------------------------------- */
export const NotificationBell = {
  name: 'NotificationBell',
  template: `
    <div class="dropdown">
      <button class="btn btn-sm position-relative text-white" data-bs-toggle="dropdown" @click="load">
        <i class="bi bi-bell fs-5"></i>
        <span v-if="unreadCount > 0" class="pt-notif-dot"></span>
      </button>
      <div class="dropdown-menu dropdown-menu-end p-0" style="width:340px; max-height:420px; overflow:auto;">
        <div class="d-flex justify-content-between align-items-center px-3 py-2 border-bottom">
          <strong class="small">Notifications</strong>
          <button class="btn btn-sm btn-link p-0" @click="markAll" v-if="unreadCount > 0">Mark all read</button>
        </div>
        <div v-if="items.length === 0" class="text-center text-muted small py-4">You're all caught up.</div>
        <a href="#" class="dropdown-item white-space-normal py-2 border-bottom"
           v-for="n in items" :key="n.id" @click.prevent="markRead(n)">
          <div class="d-flex gap-2">
            <span class="badge rounded-pill mt-1" :class="dotClass(n.category)">&nbsp;</span>
            <div>
              <div class="small" :class="{ 'fw-semibold': !n.is_read }">{{ n.message }}</div>
              <div class="text-muted" style="font-size:0.72rem;">{{ formatTime(n.created_at) }}</div>
            </div>
          </div>
        </a>
      </div>
    </div>
  `,
  setup() {
    const items = reactive([]);
    const unreadCount = reactive({ value: 0 });

    async function load() {
      try {
        const { data } = await api.get('/common/notifications');
        items.splice(0, items.length, ...data.notifications);
        unreadCount.value = data.unread_count;
      } catch (e) { /* silent */ }
    }
    async function markRead(n) {
      if (!n.is_read) {
        await api.post(`/common/notifications/${n.id}/read`);
        n.is_read = true;
        unreadCount.value = Math.max(0, unreadCount.value - 1);
      }
    }
    async function markAll() {
      await api.post('/common/notifications/read-all');
      items.forEach((n) => (n.is_read = true));
      unreadCount.value = 0;
    }
    function dotClass(cat) {
      return { info: 'text-bg-primary', success: 'text-bg-success', warning: 'text-bg-warning', danger: 'text-bg-danger' }[cat] || 'text-bg-secondary';
    }
    function formatTime(iso) {
      if (!iso) return '';
      const d = new Date(iso + 'Z');
      return d.toLocaleString();
    }

    onMounted(load);
    let poll;
    onMounted(() => { poll = setInterval(load, 30000); });
    Vue.onUnmounted(() => clearInterval(poll));

    return { items, unreadCount: computed(() => unreadCount.value), load, markRead, markAll, dotClass, formatTime };
  },
};

/* ---------------------------------------------------------------------------
 * Dashboard shell: top navbar + role-based sidebar + <router-view/>
 * ------------------------------------------------------------------------- */
export const DashboardLayout = {
  name: 'DashboardLayout',
  components: { NotificationBell },
  template: `
    <div class="pt-shell">
      <nav class="navbar navbar-expand pt-navbar px-3 py-2">
        <router-link class="navbar-brand" to="/">
          <i class="bi bi-diagram-3-fill"></i> PlaceTrack
        </router-link>
        <div class="ms-auto d-flex align-items-center gap-2">
          <notification-bell />
          <div class="dropdown">
            <button class="btn btn-sm btn-outline-light dropdown-toggle" data-bs-toggle="dropdown">
              <i class="bi bi-person-circle"></i> {{ authStore.user && authStore.user.name }}
            </button>
            <ul class="dropdown-menu dropdown-menu-end">
              <li><span class="dropdown-item-text small text-muted">{{ authStore.user && authStore.user.email }}</span></li>
              <li><hr class="dropdown-divider"></li>
              <li><a class="dropdown-item" href="#" @click.prevent="doLogout"><i class="bi bi-box-arrow-right"></i> Logout</a></li>
            </ul>
          </div>
        </div>
      </nav>
      <div class="d-flex flex-grow-1">
        <aside class="pt-sidebar" style="width:230px; flex-shrink:0;">
          <nav class="nav flex-column">
            <router-link v-for="item in navItems" :key="item.to" :to="item.to" class="nav-link">
              <i :class="'bi ' + item.icon"></i> {{ item.label }}
            </router-link>
          </nav>
        </aside>
        <main class="pt-main flex-grow-1">
          <div class="container-fluid px-4">
            <router-view />
          </div>
        </main>
      </div>
    </div>
  `,
  setup() {
    const router = VueRouter.useRouter();
    const role = authStore.user ? authStore.user.role : null;

    const navMap = {
      student: [
        { to: '/student/dashboard', label: 'Dashboard', icon: 'bi-speedometer2' },
        { to: '/student/drives', label: 'Browse Drives', icon: 'bi-search' },
        { to: '/student/applications', label: 'My Applications', icon: 'bi-card-checklist' },
        { to: '/student/history', label: 'Placement History', icon: 'bi-trophy' },
        { to: '/student/profile', label: 'Profile & Resume', icon: 'bi-person-badge' },
      ],
      company: [
        { to: '/company/dashboard', label: 'Dashboard', icon: 'bi-speedometer2' },
        { to: '/company/drives', label: 'My Drives', icon: 'bi-briefcase' },
        { to: '/company/drives/new', label: 'Post a Drive', icon: 'bi-plus-circle' },
        { to: '/company/profile', label: 'Company Profile', icon: 'bi-building' },
      ],
      admin: [
        { to: '/admin/dashboard', label: 'Dashboard', icon: 'bi-speedometer2' },
        { to: '/admin/companies', label: 'Companies', icon: 'bi-building' },
        { to: '/admin/students', label: 'Students', icon: 'bi-people' },
        { to: '/admin/drives', label: 'Placement Drives', icon: 'bi-briefcase' },
        { to: '/admin/reports', label: 'Reports', icon: 'bi-file-earmark-bar-graph' },
      ],
    };

    function doLogout() {
      logout();
      router.push('/login');
    }

    return { authStore, navItems: navMap[role] || [], doLogout };
  },
};

/* ---------------------------------------------------------------------------
 * Public landing page
 * ------------------------------------------------------------------------- */
export const Home = {
  name: 'Home',
  template: `
    <div>
      <nav class="navbar navbar-expand pt-navbar px-3 py-2">
        <router-link class="navbar-brand" to="/"><i class="bi bi-diagram-3-fill"></i> PlaceTrack</router-link>
        <div class="ms-auto d-flex gap-2">
          <router-link class="btn btn-sm btn-outline-light" to="/login">Log in</router-link>
          <router-link class="btn btn-sm btn-pt-amber" to="/register/student">Get started</router-link>
        </div>
      </nav>

      <header class="pt-auth-brand" style="min-height: 62vh; padding: 3rem 1.5rem;">
        <div class="container">
          <p class="pt-eyebrow">Campus Recruitment, Tracked End-to-End</p>
          <h1 class="mb-3">Every application, every stage,<br class="d-none d-md-block"> one clear track.</h1>
          <p class="mb-4" style="max-width:560px; color:rgba(255,255,255,0.8);">
            PlaceTrack replaces spreadsheets and email threads with a single portal where the placement cell,
            recruiters, and students always know exactly where a drive stands.
          </p>
          <div class="d-flex gap-3 flex-wrap mb-5">
            <router-link class="btn btn-pt-amber btn-lg" to="/register/student"><i class="bi bi-mortarboard"></i> I'm a Student</router-link>
            <router-link class="btn btn-outline-light btn-lg" to="/register/company"><i class="bi bi-building"></i> I'm a Company</router-link>
          </div>
          <div class="pt-rail" style="max-width:560px;">
            <div class="pt-rail-step pt-rail-done"><div class="pt-rail-dot"></div><span style="color:rgba(255,255,255,0.6)">Register</span></div>
            <div class="pt-rail-step pt-rail-done"><div class="pt-rail-dot"></div><span style="color:rgba(255,255,255,0.6)">Apply</span></div>
            <div class="pt-rail-step pt-rail-current"><div class="pt-rail-dot"></div><span style="color:#fff">Track</span></div>
            <div class="pt-rail-step"><div class="pt-rail-dot"></div><span style="color:rgba(255,255,255,0.6)">Get Placed</span></div>
          </div>
        </div>
      </header>

      <section class="container py-5">
        <div class="row g-4">
          <div class="col-md-4">
            <div class="pt-card p-4 h-100">
              <i class="bi bi-shield-check fs-2" style="color: var(--pt-amber);"></i>
              <h5 class="mt-3">Admin oversight</h5>
              <p class="text-muted small mb-0">Every company and drive is reviewed by the placement cell before it goes live — no spam, no unverified recruiters.</p>
            </div>
          </div>
          <div class="col-md-4">
            <div class="pt-card p-4 h-100">
              <i class="bi bi-lightning-charge fs-2" style="color: var(--pt-amber);"></i>
              <h5 class="mt-3">Eligibility-aware search</h5>
              <p class="text-muted small mb-0">Students only see drives they actually qualify for, filtered instantly by branch, CGPA, and graduation year.</p>
            </div>
          </div>
          <div class="col-md-4">
            <div class="pt-card p-4 h-100">
              <i class="bi bi-graph-up-arrow fs-2" style="color: var(--pt-amber);"></i>
              <h5 class="mt-3">Automated reporting</h5>
              <p class="text-muted small mb-0">Deadline reminders, monthly PDF activity reports, and CSV exports all run in the background — zero manual work.</p>
            </div>
          </div>
        </div>
      </section>

      <footer class="pt-footer text-center">
        &copy; 2026 PlaceTrack — Institute Placement Portal, built for App Dev II.
      </footer>
    </div>
  `,
};

export const NotFound = {
  name: 'NotFound',
  template: `
    <div class="pt-empty-state">
      <i class="bi bi-signpost-2 fs-1" style="color: var(--pt-amber);"></i>
      <h3 class="mt-3">Page not found</h3>
      <p class="text-muted">That route doesn't exist on this track.</p>
      <router-link class="btn btn-pt-primary" to="/">Back to home</router-link>
    </div>
  `,
};

export { authStore, hasRole, pushToast, errorMessage };
