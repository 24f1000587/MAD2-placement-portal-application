import api, { errorMessage } from '../api.js';
import { loginSuccess } from '../store.js';
import { pushToast } from '../toast.js';

const { reactive, ref } = Vue;

/* ---------------------------------------------------------------------------
 * Login
 * ------------------------------------------------------------------------- */
export const Login = {
  name: 'Login',
  template: `
    <div class="pt-auth-shell">
      <div class="pt-auth-brand d-none d-lg-flex">
        <p class="pt-eyebrow">Welcome back</p>
        <h1>Pick up right where<br/>your track left off.</h1>
        <p style="color:rgba(255,255,255,0.75); max-width:420px;">
          One account, one login — students, companies, and the placement cell all sign in here.
        </p>
      </div>
      <div class="pt-auth-form-wrap">
        <div class="pt-auth-card">
          <router-link to="/" class="pt-mono small text-muted d-inline-block mb-4"><i class="bi bi-arrow-left"></i> Back home</router-link>
          <h3 class="mb-1">Log in to PlaceTrack</h3>
          <p class="text-muted mb-4">Enter your credentials to continue.</p>

          <form @submit.prevent="submit" novalidate>
            <div class="mb-3">
              <label class="pt-form-label">Email address</label>
              <input type="email" class="form-control" v-model.trim="form.email" required autocomplete="email" />
            </div>
            <div class="mb-3">
              <label class="pt-form-label">Password</label>
              <input type="password" class="form-control" v-model="form.password" required minlength="8" autocomplete="current-password" />
            </div>
            <div v-if="error" class="alert alert-danger py-2 small">{{ error }}</div>
            <button class="btn btn-pt-primary w-100 py-2" :disabled="loading">
              <span v-if="loading" class="spinner-border spinner-border-sm me-1"></span>
              Log in
            </button>
          </form>

          <hr class="my-4" />
          <p class="text-center small text-muted mb-2">New to PlaceTrack?</p>
          <div class="d-flex gap-2">
            <router-link class="btn btn-pt-outline w-50" to="/register/student">Register as Student</router-link>
            <router-link class="btn btn-pt-outline w-50" to="/register/company">Register as Company</router-link>
          </div>
          <p class="text-center small text-muted mt-4 mb-0">
            Admin access is pre-provisioned by the institute — use the credentials shared with you.
          </p>
        </div>
      </div>
    </div>
  `,
  setup() {
    const router = VueRouter.useRouter();
    const form = reactive({ email: '', password: '' });
    const loading = ref(false);
    const error = ref('');

    async function submit() {
      error.value = '';
      loading.value = true;
      try {
        const { data } = await api.post('/auth/login', { ...form });
        loginSuccess(data);
        pushToast(`Welcome back, ${data.user.name.split(' ')[0]}!`);
        router.push(`/${data.user.role}/dashboard`);
      } catch (e) {
        error.value = errorMessage(e, 'Login failed.');
      } finally {
        loading.value = false;
      }
    }

    return { form, loading, error, submit };
  },
};

/* ---------------------------------------------------------------------------
 * Register — Student
 * ------------------------------------------------------------------------- */
export const RegisterStudent = {
  name: 'RegisterStudent',
  template: `
    <div class="pt-auth-shell">
      <div class="pt-auth-brand d-none d-lg-flex">
        <p class="pt-eyebrow">For students</p>
        <h1>Apply once.<br/>Track every step.</h1>
        <ul class="list-unstyled" style="color:rgba(255,255,255,0.8);">
          <li class="mb-2"><i class="bi bi-check2-circle text-warning"></i> See only drives you're eligible for</li>
          <li class="mb-2"><i class="bi bi-check2-circle text-warning"></i> Live status from applied to selected</li>
          <li class="mb-2"><i class="bi bi-check2-circle text-warning"></i> Deadline reminders, automatically</li>
        </ul>
      </div>
      <div class="pt-auth-form-wrap">
        <div class="pt-auth-card" style="max-width:500px;">
          <router-link to="/" class="pt-mono small text-muted d-inline-block mb-3"><i class="bi bi-arrow-left"></i> Back home</router-link>
          <h3 class="mb-1">Create your student account</h3>
          <p class="text-muted mb-4">Fields marked * are required.</p>

          <form @submit.prevent="submit" novalidate>
            <div class="row g-3">
              <div class="col-12">
                <label class="pt-form-label">Full name *</label>
                <input class="form-control" v-model.trim="form.name" required />
              </div>
              <div class="col-md-6">
                <label class="pt-form-label">Email *</label>
                <input type="email" class="form-control" v-model.trim="form.email" required />
              </div>
              <div class="col-md-6">
                <label class="pt-form-label">Password *</label>
                <input type="password" class="form-control" v-model="form.password" required minlength="8" />
                <div class="form-text">At least 8 characters, letters + numbers.</div>
              </div>
              <div class="col-md-6">
                <label class="pt-form-label">Roll number *</label>
                <input class="form-control pt-mono" v-model.trim="form.roll_number" required />
              </div>
              <div class="col-md-6">
                <label class="pt-form-label">Branch *</label>
                <select class="form-select" v-model="form.branch" required>
                  <option value="" disabled>Select branch</option>
                  <option v-for="b in branches" :key="b" :value="b">{{ b }}</option>
                </select>
              </div>
              <div class="col-md-6">
                <label class="pt-form-label">Graduation year *</label>
                <input type="number" class="form-control" v-model.number="form.graduation_year" min="2000" max="2100" required />
              </div>
              <div class="col-md-6">
                <label class="pt-form-label">CGPA *</label>
                <input type="number" step="0.01" class="form-control" v-model.number="form.cgpa" min="0" max="10" required />
              </div>
              <div class="col-md-6">
                <label class="pt-form-label">Phone</label>
                <input class="form-control" v-model.trim="form.phone" />
              </div>
              <div class="col-md-6">
                <label class="pt-form-label">Skills (comma separated)</label>
                <input class="form-control" v-model.trim="form.skills" placeholder="Python, SQL, React" />
              </div>
            </div>

            <div v-if="error" class="alert alert-danger py-2 small mt-3">{{ error }}</div>
            <button class="btn btn-pt-primary w-100 py-2 mt-3" :disabled="loading">
              <span v-if="loading" class="spinner-border spinner-border-sm me-1"></span>
              Create account
            </button>
          </form>
          <p class="text-center small text-muted mt-3 mb-0">
            Already have an account? <router-link to="/login" class="pt-link-amber">Log in</router-link>
          </p>
        </div>
      </div>
    </div>
  `,
  setup() {
    const router = VueRouter.useRouter();
    const form = reactive({
      name: '', email: '', password: '', roll_number: '', branch: '',
      graduation_year: new Date().getFullYear() + 1, cgpa: null, phone: '', skills: '',
    });
    const branches = ref([]);
    const loading = ref(false);
    const error = ref('');

    api.get('/common/branches').then(({ data }) => { branches.value = data.branches; });

    async function submit() {
      error.value = '';
      loading.value = true;
      try {
        const { data } = await api.post('/auth/register/student', { ...form });
        loginSuccess(data);
        pushToast('Account created! Welcome to PlaceTrack.');
        router.push('/student/dashboard');
      } catch (e) {
        error.value = errorMessage(e, 'Registration failed.');
      } finally {
        loading.value = false;
      }
    }

    return { form, branches, loading, error, submit };
  },
};

/* ---------------------------------------------------------------------------
 * Register — Company
 * ------------------------------------------------------------------------- */
export const RegisterCompany = {
  name: 'RegisterCompany',
  template: `
    <div class="pt-auth-shell">
      <div class="pt-auth-brand d-none d-lg-flex">
        <p class="pt-eyebrow">For recruiters</p>
        <h1>Post drives.<br/>Reach verified talent.</h1>
        <ul class="list-unstyled" style="color:rgba(255,255,255,0.8);">
          <li class="mb-2"><i class="bi bi-check2-circle text-warning"></i> Admin-approved drives build trust</li>
          <li class="mb-2"><i class="bi bi-check2-circle text-warning"></i> Filter, shortlist, and schedule in one place</li>
          <li class="mb-2"><i class="bi bi-check2-circle text-warning"></i> Generate offer letters instantly</li>
        </ul>
      </div>
      <div class="pt-auth-form-wrap">
        <div class="pt-auth-card" style="max-width:520px;">
          <router-link to="/" class="pt-mono small text-muted d-inline-block mb-3"><i class="bi bi-arrow-left"></i> Back home</router-link>
          <h3 class="mb-1">Register your company</h3>
          <p class="text-muted mb-4">Your profile will need placement-cell approval before you can post drives.</p>

          <form @submit.prevent="submit" novalidate>
            <div class="row g-3">
              <div class="col-12">
                <label class="pt-form-label">Company name *</label>
                <input class="form-control" v-model.trim="form.company_name" required />
              </div>
              <div class="col-md-6">
                <label class="pt-form-label">HR contact name *</label>
                <input class="form-control" v-model.trim="form.hr_contact_name" required />
              </div>
              <div class="col-md-6">
                <label class="pt-form-label">HR contact email *</label>
                <input type="email" class="form-control" v-model.trim="form.hr_contact_email" required />
              </div>
              <div class="col-md-6">
                <label class="pt-form-label">Login email *</label>
                <input type="email" class="form-control" v-model.trim="form.email" required />
              </div>
              <div class="col-md-6">
                <label class="pt-form-label">Password *</label>
                <input type="password" class="form-control" v-model="form.password" required minlength="8" />
              </div>
              <div class="col-md-6">
                <label class="pt-form-label">HR phone</label>
                <input class="form-control" v-model.trim="form.hr_phone" />
              </div>
              <div class="col-md-6">
                <label class="pt-form-label">Website</label>
                <input class="form-control" v-model.trim="form.website" placeholder="https://" />
              </div>
              <div class="col-md-6">
                <label class="pt-form-label">Industry</label>
                <input class="form-control" v-model.trim="form.industry" placeholder="e.g. Fintech" />
              </div>
              <div class="col-12">
                <label class="pt-form-label">Short description</label>
                <textarea class="form-control" rows="2" v-model.trim="form.description"></textarea>
              </div>
            </div>

            <div v-if="error" class="alert alert-danger py-2 small mt-3">{{ error }}</div>
            <button class="btn btn-pt-primary w-100 py-2 mt-3" :disabled="loading">
              <span v-if="loading" class="spinner-border spinner-border-sm me-1"></span>
              Register company
            </button>
          </form>
          <p class="text-center small text-muted mt-3 mb-0">
            Already have an account? <router-link to="/login" class="pt-link-amber">Log in</router-link>
          </p>
        </div>
      </div>
    </div>
  `,
  setup() {
    const router = VueRouter.useRouter();
    const form = reactive({
      company_name: '', hr_contact_name: '', hr_contact_email: '', email: '', password: '',
      hr_phone: '', website: '', industry: '', description: '',
    });
    const loading = ref(false);
    const error = ref('');

    async function submit() {
      error.value = '';
      loading.value = true;
      try {
        const { data } = await api.post('/auth/register/company', { ...form });
        loginSuccess(data);
        pushToast('Registered! Your profile is pending admin approval.');
        router.push('/company/dashboard');
      } catch (e) {
        error.value = errorMessage(e, 'Registration failed.');
      } finally {
        loading.value = false;
      }
    }

    return { form, loading, error, submit };
  },
};
