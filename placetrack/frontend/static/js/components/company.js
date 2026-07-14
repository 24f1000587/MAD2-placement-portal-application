import api, { errorMessage, downloadFile } from '../api.js';
import { pushToast } from '../toast.js';
import { StatusBadge } from './common.js';

const { reactive, ref, onMounted } = Vue;

const BRANCH_OPTIONS = [
  'Computer Science', 'Information Technology', 'Electronics & Communication',
  'Electrical Engineering', 'Mechanical Engineering', 'Civil Engineering',
  'Chemical Engineering', 'Data Science',
];

/* ---------------------------------------------------------------------------
 * Dashboard 

 * ------------------------------------------------------------------------- */
export const CompanyDashboard = {
  name: 'CompanyDashboard',
  components: { StatusBadge },
  template: `
    <div>
      <h3 class="mb-1">Company dashboard</h3>
      <p class="text-muted mb-3">
        Approval status:
        <span class="pt-badge" :class="'pt-badge-' + data.approval_status">{{ data.approval_status }}</span>
      </p>

      <div v-if="data.approval_status === 'pending'" class="alert alert-warning small">
        <i class="bi bi-hourglass-split"></i> Your profile is awaiting placement-cell approval. You'll be able to post drives once approved.
      </div>
      <div v-else-if="data.approval_status === 'rejected'" class="alert alert-danger small">
        <i class="bi bi-x-circle"></i> Your registration was rejected. Contact the placement cell for details.
      </div>

      <div v-if="loading" class="pt-spinner-wrap"><div class="spinner-border"></div></div>
      <template v-else>
        <div class="row g-3 mb-4">
          <div class="col-6 col-lg-4">
            <div class="pt-stat-card"><div class="pt-stat-value">{{ data.total_drives }}</div><div class="pt-stat-label">Drives Posted</div></div>
          </div>
          <div class="col-6 col-lg-4">
            <div class="pt-stat-card"><div class="pt-stat-value">{{ data.total_applicants }}</div><div class="pt-stat-label">Total Applicants</div></div>
          </div>
          <div class="col-6 col-lg-4">
            <div class="pt-stat-card"><div class="pt-stat-value">{{ data.total_selected }}</div><div class="pt-stat-label">Selected</div></div>
          </div>
        </div>

        <div class="pt-card p-4">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <h6 class="mb-0">Applicants per drive</h6>
            <router-link class="btn btn-sm btn-pt-amber" to="/company/drives/new">Post a new drive</router-link>
          </div>
          <canvas ref="chartRef" height="200" v-if="data.drives.length"></canvas>
          <div v-else class="text-muted small">No drives posted yet.</div>
        </div>
      </template>
    </div>
  `,
  setup() {
    const loading = ref(true);
    const data = reactive({ approval_status: 'pending', total_drives: 0, total_applicants: 0, total_selected: 0, drives: [] });
    const chartRef = ref(null);

    onMounted(async () => {
      try {
        const { data: res } = await api.get('/company/dashboard');
        Object.assign(data, res);
      } finally {
        loading.value = false;
      }
      Vue.nextTick(() => {
        if (!chartRef.value || data.drives.length === 0) return;
        new Chart(chartRef.value, {
          type: 'bar',
          data: {
            labels: data.drives.map((d) => d.job_title),
            datasets: [
              { label: 'Applicants', data: data.drives.map((d) => d.applicant_count), backgroundColor: '#14213D', borderRadius: 6 },
              { label: 'Selected', data: data.drives.map((d) => d.selected_count), backgroundColor: '#FCA311', borderRadius: 6 },
            ],
          },
          options: { scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
        });
      });
    });

    return { loading, data, chartRef };
  },
};

/* ---------------------------------------------------------------------------
 * Create drive
 * ------------------------------------------------------------------------- */
export const CreateDrive = {
  name: 'CreateDrive',
  template: `
    <div>
      <h3 class="mb-1">Post a placement drive</h3>
      <p class="text-muted mb-4">Submitted drives go live only after admin approval.</p>

      <div class="pt-card p-4" style="max-width:720px;">
        <form @submit.prevent="submit" novalidate>
          <div class="row g-3">
            <div class="col-12">
              <label class="pt-form-label">Job title *</label>
              <input class="form-control" v-model.trim="form.job_title" required />
            </div>
            <div class="col-12">
              <label class="pt-form-label">Job description *</label>
              <textarea class="form-control" rows="4" v-model.trim="form.job_description" required></textarea>
            </div>
            <div class="col-md-6">
              <label class="pt-form-label">Package (LPA)</label>
              <input type="number" step="0.1" class="form-control" v-model.number="form.package_lpa" />
            </div>
            <div class="col-md-6">
              <label class="pt-form-label">Location</label>
              <input class="form-control" v-model.trim="form.location" />
            </div>
            <div class="col-md-6">
              <label class="pt-form-label">Minimum CGPA *</label>
              <input type="number" step="0.01" min="0" max="10" class="form-control" v-model.number="form.min_cgpa" required />
            </div>
            <div class="col-md-6">
              <label class="pt-form-label">Application deadline *</label>
              <input type="date" class="form-control" v-model="form.application_deadline" required />
            </div>
            <div class="col-md-6">
              <label class="pt-form-label">Drive date</label>
              <input type="date" class="form-control" v-model="form.drive_date" />
            </div>
            <div class="col-12">
              <label class="pt-form-label">Eligible branches *</label>
              <div class="d-flex flex-wrap gap-2">
                <div class="form-check" v-for="b in branchOptions" :key="b">
                  <input class="form-check-input" type="checkbox" :value="b" v-model="form.eligible_branches" :id="'branch-'+b">
                  <label class="form-check-label small" :for="'branch-'+b">{{ b }}</label>
                </div>
              </div>
            </div>
            <div class="col-12">
              <label class="pt-form-label">Eligible graduation years * (comma separated)</label>
              <input class="form-control" v-model.trim="yearsInput" placeholder="2026, 2027" required />
            </div>
          </div>

          <div v-if="error" class="alert alert-danger py-2 small mt-3">{{ error }}</div>
          <button class="btn btn-pt-primary mt-3" :disabled="saving">
            <span v-if="saving" class="spinner-border spinner-border-sm me-1"></span>
            Submit for approval
          </button>
        </form>
      </div>
    </div>
  `,
  setup() {
    const router = VueRouter.useRouter();
    const form = reactive({
      job_title: '', job_description: '', package_lpa: null, location: '',
      min_cgpa: 6.0, application_deadline: '', drive_date: '', eligible_branches: [],
    });
    const yearsInput = ref('');
    const branchOptions = BRANCH_OPTIONS;
    const saving = ref(false);
    const error = ref('');

    async function submit() {
      error.value = '';
      if (form.eligible_branches.length === 0) { error.value = 'Select at least one eligible branch.'; return; }
      const eligible_years = yearsInput.value.split(',').map((y) => y.trim()).filter(Boolean);
      if (eligible_years.length === 0) { error.value = 'Enter at least one eligible graduation year.'; return; }

      saving.value = true;
      try {
        await api.post('/company/drives', { ...form, eligible_years });
        pushToast('Drive submitted for admin approval.');
        router.push('/company/drives');
      } catch (e) {
        error.value = errorMessage(e, 'Could not create drive.');
      } finally {
        saving.value = false;
      }
    }

    return { form, yearsInput, branchOptions, saving, error, submit };
  },
};

/* ---------------------------------------------------------------------------
 * Manage drives (list + link to applicants)
 * ------------------------------------------------------------------------- */
export const ManageDrives = {
  name: 'ManageDrives',
  components: { StatusBadge },
  template: `
    <div>
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h3 class="mb-0">My drives</h3>
        <router-link class="btn btn-pt-amber btn-sm" to="/company/drives/new"><i class="bi bi-plus-circle"></i> Post a drive</router-link>
      </div>
      <div v-if="loading" class="pt-spinner-wrap"><div class="spinner-border"></div></div>
      <div v-else-if="drives.length === 0" class="pt-empty-state">
        <i class="bi bi-briefcase fs-1" style="color:var(--pt-amber);"></i>
        <h5 class="mt-3">No drives posted yet</h5>
      </div>
      <div v-else class="table-responsive pt-card p-3">
        <table class="table pt-table align-middle mb-0">
          <thead><tr><th>Role</th><th>Status</th><th>Deadline</th><th>Applicants</th><th></th></tr></thead>
          <tbody>
            <tr v-for="d in drives" :key="d.id">
              <td>
                <div class="fw-semibold">{{ d.job_title }}</div>
                <div class="text-muted small">{{ d.package_lpa ? d.package_lpa + ' LPA' : '' }}</div>
              </td>
              <td><status-badge :status="d.status" /></td>
              <td class="pt-mono">{{ d.application_deadline }}</td>
              <td>{{ d.applicant_count }}</td>
              <td class="text-end">
                <router-link class="btn btn-sm btn-pt-outline" :to="'/company/drives/' + d.id + '/applicants'">View applicants</router-link>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
  setup() {
    const drives = ref([]);
    const loading = ref(true);
    onMounted(async () => {
      try {
        const { data } = await api.get('/company/drives');
        drives.value = data.drives;
      } finally {
        loading.value = false;
      }
    });
    return { drives, loading };
  },
};

/* ---------------------------------------------------------------------------
 * Applicants for one drive
 * ------------------------------------------------------------------------- */
export const DriveApplicants = {
  name: 'DriveApplicants',
  components: { StatusBadge },
  template: `
    <div v-if="drive">
      <router-link to="/company/drives" class="small text-muted d-inline-block mb-2"><i class="bi bi-arrow-left"></i> Back to my drives</router-link>
      <h3 class="mb-0">{{ drive.job_title }}</h3>
      <p class="text-muted mb-4">{{ applicants.length }} applicant(s)</p>

      <div v-if="applicants.length === 0" class="pt-empty-state">
        <i class="bi bi-people fs-1" style="color:var(--pt-amber);"></i>
        <h5 class="mt-3">No applicants yet</h5>
      </div>
      <div v-else class="d-flex flex-column gap-3">
        <div class="pt-card p-3" v-for="a in applicants" :key="a.id">
          <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
            <div>
              <h6 class="mb-0">{{ a.student.name }} <span class="text-muted small pt-mono">({{ a.student.roll_number }})</span></h6>
              <div class="text-muted small">{{ a.student.branch }} &middot; CGPA {{ a.student.cgpa }} &middot; Batch {{ a.student.graduation_year }}</div>
            </div>
            <status-badge :status="a.status" />
          </div>
          <div class="d-flex flex-wrap gap-2 mt-3">
            <button v-if="a.status === 'applied'" class="btn btn-sm btn-pt-primary" @click="updateStatus(a, 'shortlisted')">Shortlist</button>
            <button v-if="a.status === 'shortlisted'" class="btn btn-sm btn-pt-primary" @click="scheduleInterview(a)">Schedule interview</button>
            <button v-if="a.status === 'interview_scheduled'" class="btn btn-sm btn-pt-amber" @click="updateStatus(a, 'selected')">Mark selected</button>
            <button v-if="['applied','shortlisted','interview_scheduled'].includes(a.status)" class="btn btn-sm btn-outline-danger" @click="updateStatus(a, 'rejected')">Reject</button>
            <button v-if="a.status === 'selected' && !a.has_offer_letter" class="btn btn-sm btn-pt-outline" @click="generateOffer(a)">
              <i class="bi bi-file-earmark-pdf"></i> Generate offer letter
            </button>
            <a v-if="a.has_offer_letter" class="btn btn-sm btn-pt-outline" href="#" @click.prevent="downloadOffer(a)">
              <i class="bi bi-download"></i> Offer letter
            </a>
          </div>
        </div>
      </div>
    </div>
  `,
  setup() {
    const route = VueRouter.useRoute();
    const drive = ref(null);
    const applicants = ref([]);

    async function load() {
      const { data } = await api.get(`/company/drives/${route.params.id}/applicants`);
      drive.value = data.drive;
      applicants.value = data.applicants;
    }

    async function updateStatus(app, status, extra = {}) {
      try {
        await api.put(`/company/applications/${app.id}/status`, { status, ...extra });
        pushToast('Application updated.');
        await load();
      } catch (e) {
        pushToast(errorMessage(e), 'error');
      }
    }

    function scheduleInterview(app) {
      const when = prompt('Interview date & time (YYYY-MM-DDTHH:MM), e.g. 2026-08-15T10:00');
      if (!when) return;
      updateStatus(app, 'interview_scheduled', { interview_datetime: when });
    }

    async function generateOffer(app) {
      try {
        await api.post(`/company/applications/${app.id}/offer-letter`);
        pushToast('Offer letter generated.');
        await load();
      } catch (e) {
        pushToast(errorMessage(e), 'error');
      }
    }

    async function downloadOffer(app) {
      try {
        await downloadFile(
          `/company/applications/${app.id}/offer-letter`,
          `offer_letter_${app.student.roll_number}.pdf`
        );
      } catch (e) {
        pushToast(errorMessage(e, 'Could not download the offer letter.'), 'error');
      }
    }

    onMounted(load);
    return { drive, applicants, updateStatus, scheduleInterview, generateOffer, downloadOffer };
  },
};

/* ---------------------------------------------------------------------------
 * Company profile
 * ------------------------------------------------------------------------- */
export const CompanyProfileView = {
  name: 'CompanyProfileView',
  template: `
    <div>
      <h3 class="mb-1">Company profile</h3>
      <p class="text-muted mb-4">This is what students and the placement cell see.</p>
      <div v-if="loading" class="pt-spinner-wrap"><div class="spinner-border"></div></div>
      <div v-else class="pt-card p-4" style="max-width:640px;">
        <form @submit.prevent="save">
          <div class="row g-3">
            <div class="col-12">
              <label class="pt-form-label">Company name</label>
              <input class="form-control" :value="form.company_name" disabled />
            </div>
            <div class="col-md-6">
              <label class="pt-form-label">HR contact name</label>
              <input class="form-control" v-model.trim="form.hr_contact_name" />
            </div>
            <div class="col-md-6">
              <label class="pt-form-label">HR contact email</label>
              <input class="form-control" v-model.trim="form.hr_contact_email" />
            </div>
            <div class="col-md-6">
              <label class="pt-form-label">HR phone</label>
              <input class="form-control" v-model.trim="form.hr_phone" />
            </div>
            <div class="col-md-6">
              <label class="pt-form-label">Website</label>
              <input class="form-control" v-model.trim="form.website" />
            </div>
            <div class="col-md-6">
              <label class="pt-form-label">Industry</label>
              <input class="form-control" v-model.trim="form.industry" />
            </div>
            <div class="col-12">
              <label class="pt-form-label">Description</label>
              <textarea class="form-control" rows="3" v-model.trim="form.description"></textarea>
            </div>
          </div>
          <button class="btn btn-pt-primary mt-3" :disabled="saving">
            <span v-if="saving" class="spinner-border spinner-border-sm me-1"></span>
            Save changes
          </button>
        </form>
      </div>
    </div>
  `,
  setup() {
    const loading = ref(true);
    const saving = ref(false);
    const form = reactive({});
    onMounted(async () => {
      try {
        const { data } = await api.get('/company/profile');
        Object.assign(form, data.profile);
      } finally {
        loading.value = false;
      }
    });
    async function save() {
      saving.value = true;
      try {
        const { data } = await api.put('/company/profile', form);
        Object.assign(form, data.profile);
        pushToast('Profile updated.');
      } catch (e) {
        pushToast(errorMessage(e), 'error');
      } finally {
        saving.value = false;
      }
    }
    return { form, loading, saving, save };
  },
};
