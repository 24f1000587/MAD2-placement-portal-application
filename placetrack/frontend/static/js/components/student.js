import api, { errorMessage, downloadFile } from '../api.js';
import { pushToast } from '../toast.js';
import { StatusRail, StatusBadge } from './common.js';
import { updateStoredProfile } from '../store.js';

const { reactive, ref, onMounted, computed } = Vue;

/* ---------------------------------------------------------------------------
 * Dashboard
 * ------------------------------------------------------------------------- */
export const StudentDashboard = {
  name: 'StudentDashboard',
  components: { StatusBadge },
  template: `
    <div>
      <h3 class="mb-1">Your placement snapshot</h3>
      <p class="text-muted mb-4">A quick look at where things stand.</p>

      <div v-if="loading" class="pt-spinner-wrap"><div class="spinner-border" role="status"></div></div>
      <template v-else>
        <div class="row g-3 mb-4">
          <div class="col-6 col-lg-3">
            <div class="pt-stat-card"><div class="pt-stat-value">{{ data.total_applications }}</div><div class="pt-stat-label">Applications</div></div>
          </div>
          <div class="col-6 col-lg-3">
            <div class="pt-stat-card"><div class="pt-stat-value">{{ data.status_breakdown.shortlisted || 0 }}</div><div class="pt-stat-label">Shortlisted</div></div>
          </div>
          <div class="col-6 col-lg-3">
            <div class="pt-stat-card"><div class="pt-stat-value">{{ data.status_breakdown.selected || 0 }}</div><div class="pt-stat-label">Selected</div></div>
          </div>
          <div class="col-6 col-lg-3">
            <div class="pt-stat-card" :style="{borderLeftColor: data.resume_on_file ? '' : '#C1443C'}">
              <div class="pt-stat-value">{{ data.resume_on_file ? 'Yes' : 'No' }}</div>
              <div class="pt-stat-label">Resume on File</div>
            </div>
          </div>
        </div>

        <div class="row g-4">
          <div class="col-lg-7">
            <div class="pt-card p-4">
              <h6 class="mb-3">Application status breakdown</h6>
              <canvas ref="chartRef" height="180"></canvas>
            </div>
          </div>
          <div class="col-lg-5">
            <div class="pt-card p-4 h-100">
              <h6 class="mb-3"><i class="bi bi-alarm text-warning"></i> Deadlines in the next 7 days</h6>
              <div v-if="data.upcoming_deadlines.length === 0" class="text-muted small">Nothing urgent right now.</div>
              <div v-for="d in data.upcoming_deadlines" :key="d.id" class="d-flex justify-content-between align-items-center py-2 border-bottom">
                <div>
                  <div class="fw-semibold small">{{ d.job_title }}</div>
                  <div class="text-muted small">{{ d.company_name }}</div>
                </div>
                <span class="pt-mono small">{{ d.application_deadline }}</span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  `,
  setup() {
    const loading = ref(true);
    const data = reactive({ total_applications: 0, status_breakdown: {}, resume_on_file: false, upcoming_deadlines: [] });
    const chartRef = ref(null);

    async function load() {
      loading.value = true;
      try {
        const { data: res } = await api.get('/student/dashboard');
        Object.assign(data, res);
      } catch (e) {
        pushToast(errorMessage(e), 'error');
      } finally {
        loading.value = false;
      }
      Vue.nextTick(renderChart);
    }

    function renderChart() {
      if (!chartRef.value) return;
      const labels = Object.keys(data.status_breakdown).map((s) => s.replace(/_/g, ' '));
      const values = Object.values(data.status_breakdown);
      new Chart(chartRef.value, {
        type: 'bar',
        data: {
          labels,
          datasets: [{ label: 'Applications', data: values, backgroundColor: '#FCA311', borderRadius: 6 }],
        },
        options: {
          plugins: { legend: { display: false } },
          scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
        },
      });
    }

    onMounted(load);
    return { loading, data, chartRef };
  },
};

/* ---------------------------------------------------------------------------
 * Browse drives
 * ------------------------------------------------------------------------- */
export const DriveBrowse = {
  name: 'DriveBrowse',
  template: `
    <div>
      <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div>
          <h3 class="mb-0">Open placement drives</h3>
          <p class="text-muted mb-0">Browse and apply to drives approved by the placement cell.</p>
        </div>
        <div class="d-flex gap-2">
          <input class="form-control" style="width:220px;" placeholder="Search company or role..." v-model="q" @input="debouncedLoad" />
          <div class="form-check form-switch d-flex align-items-center">
            <input class="form-check-input me-2" type="checkbox" v-model="eligibleOnly" @change="load" id="eligOnly">
            <label class="form-check-label small" for="eligOnly">Eligible only</label>
          </div>
        </div>
      </div>

      <div v-if="loading" class="pt-spinner-wrap"><div class="spinner-border"></div></div>
      <div v-else-if="drives.length === 0" class="pt-empty-state">
        <i class="bi bi-inboxes fs-1" style="color:var(--pt-amber);"></i>
        <h5 class="mt-3">No drives match your filters</h5>
      </div>
      <div v-else class="row g-3">
        <div class="col-md-6 col-xl-4" v-for="d in drives" :key="d.id">
          <div class="pt-card pt-card-hover p-3 h-100 d-flex flex-column">
            <div class="d-flex justify-content-between align-items-start">
              <div>
                <h6 class="mb-0">{{ d.job_title }}</h6>
                <div class="text-muted small">{{ d.company_name }}</div>
              </div>
              <span class="badge" :class="d.is_eligible ? 'text-bg-success' : 'text-bg-secondary'">
                {{ d.is_eligible ? 'Eligible' : 'Not eligible' }}
              </span>
            </div>
            <p class="small text-muted mt-2 mb-2" style="min-height:40px;">{{ (d.job_description || '').slice(0, 100) }}{{ d.job_description && d.job_description.length > 100 ? '…' : '' }}</p>
            <div class="d-flex flex-wrap gap-1 mb-2">
              <span class="badge text-bg-light border" v-for="b in d.eligible_branches" :key="b">{{ b }}</span>
            </div>
            <div class="small text-muted mb-3">
              <div><i class="bi bi-cash-stack"></i> {{ d.package_lpa ? d.package_lpa + ' LPA' : 'Not disclosed' }}</div>
              <div><i class="bi bi-calendar-event"></i> Apply by {{ d.application_deadline }}</div>
              <div><i class="bi bi-mortarboard"></i> Min CGPA {{ d.min_cgpa }}</div>
            </div>
            <router-link :to="'/student/drives/' + d.id" class="btn btn-pt-outline btn-sm mt-auto">View details</router-link>
          </div>
        </div>
      </div>
    </div>
  `,
  setup() {
    const drives = ref([]);
    const loading = ref(true);
    const q = ref('');
    const eligibleOnly = ref(false);
    let timer = null;

    async function load() {
      loading.value = true;
      try {
        const { data } = await api.get('/student/drives', { params: { q: q.value, eligible_only: eligibleOnly.value } });
        drives.value = data.drives;
      } catch (e) {
        pushToast(errorMessage(e), 'error');
      } finally {
        loading.value = false;
      }
    }
    function debouncedLoad() {
      clearTimeout(timer);
      timer = setTimeout(load, 300);
    }

    onMounted(load);
    return { drives, loading, q, eligibleOnly, load, debouncedLoad };
  },
};

/* ---------------------------------------------------------------------------
 * Drive detail + apply
 * ------------------------------------------------------------------------- */
export const DriveDetail = {
  name: 'DriveDetail',
  template: `
    <div v-if="drive">
      <router-link to="/student/drives" class="small text-muted d-inline-block mb-3"><i class="bi bi-arrow-left"></i> Back to drives</router-link>
      <div class="pt-card p-4">
        <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
          <div>
            <p class="pt-eyebrow mb-1">{{ drive.company_name }}</p>
            <h3 class="mb-0">{{ drive.job_title }}</h3>
          </div>
          <span class="badge fs-6" :class="drive.is_eligible ? 'text-bg-success' : 'text-bg-secondary'">
            {{ drive.is_eligible ? 'You are eligible' : 'Not eligible' }}
          </span>
        </div>

        <div class="row g-3 my-3">
          <div class="col-6 col-md-3"><div class="text-muted small">Package</div><div class="fw-semibold">{{ drive.package_lpa ? drive.package_lpa + ' LPA' : 'N/A' }}</div></div>
          <div class="col-6 col-md-3"><div class="text-muted small">Min CGPA</div><div class="fw-semibold">{{ drive.min_cgpa }}</div></div>
          <div class="col-6 col-md-3"><div class="text-muted small">Deadline</div><div class="fw-semibold pt-mono">{{ drive.application_deadline }}</div></div>
          <div class="col-6 col-md-3"><div class="text-muted small">Location</div><div class="fw-semibold">{{ drive.location || 'N/A' }}</div></div>
        </div>

        <p style="white-space:pre-line;">{{ drive.job_description }}</p>

        <div class="d-flex flex-wrap gap-1 mb-3">
          <span class="badge text-bg-light border" v-for="b in drive.eligible_branches" :key="b">{{ b }}</span>
          <span class="badge text-bg-light border" v-for="y in drive.eligible_years" :key="y">Batch {{ y }}</span>
        </div>

        <div v-if="drive.already_applied" class="alert alert-info small mb-0">
          <i class="bi bi-check-circle"></i> You've already applied to this drive.
          <router-link to="/student/applications" class="pt-link-amber ms-1">View status</router-link>
        </div>
        <button v-else class="btn btn-pt-amber" :disabled="!drive.is_eligible || applying" @click="apply">
          <span v-if="applying" class="spinner-border spinner-border-sm me-1"></span>
          Apply now
        </button>
      </div>
    </div>
  `,
  setup() {
    const route = VueRouter.useRoute();
    const router = VueRouter.useRouter();
    const drive = ref(null);
    const applying = ref(false);

    async function load() {
      try {
        const { data } = await api.get(`/student/drives/${route.params.id}`);
        drive.value = data.drive;
      } catch (e) {
        pushToast(errorMessage(e, 'Drive not found.'), 'error');
        router.push('/student/drives');
      }
    }
    async function apply() {
      applying.value = true;
      try {
        await api.post(`/student/drives/${route.params.id}/apply`);
        pushToast('Application submitted!');
        drive.value.already_applied = true;
      } catch (e) {
        pushToast(errorMessage(e), 'error');
      } finally {
        applying.value = false;
      }
    }

    onMounted(load);
    return { drive, applying, apply };
  },
};

/* ---------------------------------------------------------------------------
 * My applications
 * ------------------------------------------------------------------------- */
export const MyApplications = {
  name: 'MyApplications',
  components: { StatusRail, StatusBadge },
  template: `
    <div>
      <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <div>
          <h3 class="mb-0">My applications</h3>
          <p class="text-muted mb-0">Track every application's journey in real time.</p>
        </div>
        <button class="btn btn-pt-outline btn-sm" @click="exportCsv" :disabled="exporting">
          <span v-if="exporting" class="spinner-border spinner-border-sm me-1"></span>
          <i class="bi bi-download"></i> Export as CSV
        </button>
      </div>

      <div v-if="loading" class="pt-spinner-wrap"><div class="spinner-border"></div></div>
      <div v-else-if="applications.length === 0" class="pt-empty-state">
        <i class="bi bi-inbox fs-1" style="color:var(--pt-amber);"></i>
        <h5 class="mt-3">No applications yet</h5>
        <router-link to="/student/drives" class="btn btn-pt-primary mt-2">Browse open drives</router-link>
      </div>
      <div v-else class="d-flex flex-column gap-3">
        <div class="pt-card p-3" v-for="a in applications" :key="a.id">
          <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
            <div>
              <h6 class="mb-0">{{ a.drive.job_title }}</h6>
              <div class="text-muted small">{{ a.drive.company_name }} &middot; Applied {{ formatDate(a.applied_on) }}</div>
            </div>
            <status-badge :status="a.status" />
          </div>
          <status-rail v-if="a.status !== 'rejected'" :status="a.status" />
          <div v-if="a.remarks" class="small text-muted mt-2"><i class="bi bi-chat-left-text"></i> {{ a.remarks }}</div>
          <a v-if="a.has_offer_letter" class="btn btn-sm btn-pt-amber mt-2" href="#" @click.prevent="downloadOffer(a)">
            <i class="bi bi-file-earmark-pdf"></i> Download offer letter
          </a>
        </div>
      </div>
    </div>
  `,
  setup() {
    const applications = ref([]);
    const loading = ref(true);
    const exporting = ref(false);

    async function load() {
      loading.value = true;
      try {
        const { data } = await api.get('/student/applications');
        applications.value = data.applications;
      } finally {
        loading.value = false;
      }
    }

    async function exportCsv() {
      exporting.value = true;
      try {
        const { data } = await api.post('/student/export');
        pushToast('Export started — we\'ll notify you when it\'s ready.');
        pollExport(data.task_id);
      } catch (e) {
        pushToast(errorMessage(e), 'error');
        exporting.value = false;
      }
    }
    function pollExport(taskId) {
      const timer = setInterval(async () => {
        const { data } = await api.get(`/student/export/status/${taskId}`);
        if (data.state === 'SUCCESS') {
          clearInterval(timer);
          exporting.value = false;
          try {
            await downloadFile(`/student/export/download/${data.result.filename}`, data.result.filename);
            pushToast('Your CSV export is ready and downloading.');
          } catch (e) {
            pushToast('Export finished but the download failed. Try again.', 'error');
          }
        } else if (data.state === 'FAILURE') {
          clearInterval(timer);
          exporting.value = false;
          pushToast('Export failed. Please try again.', 'error');
        }
      }, 1200);
    }

    async function downloadOffer(application) {
      try {
        await downloadFile(
          `/student/applications/${application.id}/offer-letter`,
          `offer_letter_${application.drive.company_name}.pdf`
        );
      } catch (e) {
        pushToast(errorMessage(e, 'Could not download the offer letter.'), 'error');
      }
    }

    function formatDate(iso) {
      if (!iso) return '';
      return new Date(iso + 'Z').toLocaleDateString();
    }

    onMounted(load);
    return { applications, loading, exporting, exportCsv, formatDate, downloadOffer };
  },
};

/* ---------------------------------------------------------------------------
 * Placement history
 * ------------------------------------------------------------------------- */
export const PlacementHistory = {
  name: 'PlacementHistory',
  template: `
    <div>
      <h3 class="mb-1">Placement history</h3>
      <p class="text-muted mb-4">Every offer you've secured through PlaceTrack.</p>
      <div v-if="loading" class="pt-spinner-wrap"><div class="spinner-border"></div></div>
      <div v-else-if="history.length === 0" class="pt-empty-state">
        <i class="bi bi-trophy fs-1" style="color:var(--pt-amber);"></i>
        <h5 class="mt-3">No selections yet — keep applying!</h5>
      </div>
      <table v-else class="table pt-table pt-card p-2">
        <thead><tr><th>Company</th><th>Role</th><th>Selected on</th><th>Offer</th></tr></thead>
        <tbody>
          <tr v-for="a in history" :key="a.id">
            <td>{{ a.drive.company_name }}</td>
            <td>{{ a.drive.job_title }}</td>
            <td class="pt-mono">{{ formatDate(a.updated_at) }}</td>
            <td>
              <a v-if="a.has_offer_letter" class="btn btn-sm btn-pt-amber" href="#" @click.prevent="downloadOffer(a)">
                <i class="bi bi-file-earmark-pdf"></i> Download
              </a>
              <span v-else class="text-muted small">Pending</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  `,
  setup() {
    const history = ref([]);
    const loading = ref(true);
    onMounted(async () => {
      try {
        const { data } = await api.get('/student/history');
        history.value = data.history;
      } finally {
        loading.value = false;
      }
    });
    function formatDate(iso) {
      if (!iso) return '';
      return new Date(iso + 'Z').toLocaleDateString();
    }
    async function downloadOffer(application) {
      try {
        await downloadFile(
          `/student/applications/${application.id}/offer-letter`,
          `offer_letter_${application.drive.company_name}.pdf`
        );
      } catch (e) {
        pushToast(errorMessage(e, 'Could not download the offer letter.'), 'error');
      }
    }
    return { history, loading, formatDate, downloadOffer };
  },
};

/* ---------------------------------------------------------------------------
 * Profile + resume upload
 * ------------------------------------------------------------------------- */
export const StudentProfile = {
  name: 'StudentProfile',
  template: `
    <div>
      <h3 class="mb-1">Profile & resume</h3>
      <p class="text-muted mb-4">Keep this up to date — companies see it when you apply.</p>

      <div v-if="loading" class="pt-spinner-wrap"><div class="spinner-border"></div></div>
      <div v-else class="row g-4">
        <div class="col-lg-7">
          <div class="pt-card p-4">
            <h6 class="mb-3">Basic details</h6>
            <form @submit.prevent="save">
              <div class="row g-3">
                <div class="col-md-6">
                  <label class="pt-form-label">Full name</label>
                  <input class="form-control" v-model.trim="form.name" />
                </div>
                <div class="col-md-6">
                  <label class="pt-form-label">Roll number</label>
                  <input class="form-control pt-mono" :value="form.roll_number" disabled />
                </div>
                <div class="col-md-6">
                  <label class="pt-form-label">Branch</label>
                  <input class="form-control" v-model.trim="form.branch" />
                </div>
                <div class="col-md-6">
                  <label class="pt-form-label">Graduation year</label>
                  <input type="number" class="form-control" v-model.number="form.graduation_year" />
                </div>
                <div class="col-md-6">
                  <label class="pt-form-label">CGPA</label>
                  <input type="number" step="0.01" class="form-control" v-model.number="form.cgpa" />
                </div>
                <div class="col-md-6">
                  <label class="pt-form-label">Phone</label>
                  <input class="form-control" v-model.trim="form.phone" />
                </div>
                <div class="col-12">
                  <label class="pt-form-label">Skills</label>
                  <input class="form-control" v-model.trim="form.skills" />
                </div>
              </div>
              <button class="btn btn-pt-primary mt-3" :disabled="saving">
                <span v-if="saving" class="spinner-border spinner-border-sm me-1"></span>
                Save changes
              </button>
            </form>
          </div>
        </div>
        <div class="col-lg-5">
          <div class="pt-card p-4">
            <h6 class="mb-3">Resume</h6>
            <p v-if="form.resume_filename" class="small text-muted">
              <i class="bi bi-file-earmark-check text-success"></i> {{ form.resume_filename }}
              <a class="d-block mt-1 pt-link-amber" href="#" @click.prevent="downloadResume">Download current resume</a>
            </p>
            <p v-else class="small text-muted"><i class="bi bi-exclamation-triangle text-warning"></i> No resume uploaded yet.</p>
            <input type="file" class="form-control mb-2" ref="fileInput" accept=".pdf,.doc,.docx" />
            <button class="btn btn-pt-outline btn-sm" @click="upload" :disabled="uploading">
              <span v-if="uploading" class="spinner-border spinner-border-sm me-1"></span>
              Upload resume
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  setup() {
    const loading = ref(true);
    const saving = ref(false);
    const uploading = ref(false);
    const fileInput = ref(null);
    const form = reactive({});

    async function load() {
      try {
        const { data } = await api.get('/student/profile');
        Object.assign(form, data.profile);
      } finally {
        loading.value = false;
      }
    }
    async function save() {
      saving.value = true;
      try {
        const { data } = await api.put('/student/profile', form);
        Object.assign(form, data.profile);
        updateStoredProfile(data.profile);
        pushToast('Profile updated.');
      } catch (e) {
        pushToast(errorMessage(e), 'error');
      } finally {
        saving.value = false;
      }
    }
    async function upload() {
      const file = fileInput.value.files[0];
      if (!file) { pushToast('Choose a file first.', 'error'); return; }
      const fd = new FormData();
      fd.append('resume', file);
      uploading.value = true;
      try {
        const { data } = await api.post('/student/profile/resume', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        Object.assign(form, data.profile);
        pushToast('Resume uploaded.');
      } catch (e) {
        pushToast(errorMessage(e), 'error');
      } finally {
        uploading.value = false;
      }
    }

    async function downloadResume() {
      try {
        await downloadFile('/student/profile/resume', form.resume_filename || 'resume');
      } catch (e) {
        pushToast(errorMessage(e, 'Could not download the resume.'), 'error');
      }
    }

    onMounted(load);
    return { form, loading, saving, uploading, fileInput, save, upload, downloadResume };
  },
};
