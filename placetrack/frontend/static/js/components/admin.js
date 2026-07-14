import api, { errorMessage, downloadFile } from '../api.js';
import { pushToast } from '../toast.js';
import { StatusBadge } from './common.js';

const { reactive, ref, onMounted } = Vue;

/* ---------------------------------------------------------------------------
 * Dashboard
 * ------------------------------------------------------------------------- */
export const AdminDashboard = {
  name: 'AdminDashboard',
  template: `
    <div>
      <h3 class="mb-1">Placement cell overview</h3>
      <p class="text-muted mb-4">Institute-wide snapshot, refreshed every minute.</p>

      <div v-if="loading" class="pt-spinner-wrap"><div class="spinner-border"></div></div>
      <template v-else>
        <div class="row g-3 mb-4">
          <div class="col-6 col-lg-3">
            <div class="pt-stat-card"><div class="pt-stat-value">{{ data.total_students }}</div><div class="pt-stat-label">Students</div></div>
          </div>
          <div class="col-6 col-lg-3">
            <div class="pt-stat-card"><div class="pt-stat-value">{{ data.total_companies }}</div><div class="pt-stat-label">Companies</div></div>
          </div>
          <div class="col-6 col-lg-3">
            <div class="pt-stat-card"><div class="pt-stat-value">{{ data.total_drives }}</div><div class="pt-stat-label">Placement Drives</div></div>
          </div>
          <div class="col-6 col-lg-3">
            <div class="pt-stat-card"><div class="pt-stat-value">{{ data.total_selected }}</div><div class="pt-stat-label">Students Selected</div></div>
          </div>
        </div>

        <div class="row g-3 mb-4">
          <div class="col-md-6">
            <div class="pt-card p-3 d-flex justify-content-between align-items-center">
              <div><i class="bi bi-hourglass-split text-warning fs-4"></i> <strong>{{ data.pending_companies }}</strong> companies awaiting approval</div>
              <router-link class="btn btn-sm btn-pt-outline" to="/admin/companies">Review</router-link>
            </div>
          </div>
          <div class="col-md-6">
            <div class="pt-card p-3 d-flex justify-content-between align-items-center">
              <div><i class="bi bi-hourglass-split text-warning fs-4"></i> <strong>{{ data.pending_drives }}</strong> drives awaiting approval</div>
              <router-link class="btn btn-sm btn-pt-outline" to="/admin/drives">Review</router-link>
            </div>
          </div>
        </div>

        <div class="pt-card p-4">
          <h6 class="mb-3">Students by branch</h6>
          <canvas ref="chartRef" height="180"></canvas>
        </div>
      </template>
    </div>
  `,
  setup() {
    const loading = ref(true);
    const data = reactive({
      total_students: 0, total_companies: 0, total_drives: 0, total_selected: 0,
      pending_companies: 0, pending_drives: 0, students_by_branch: {},
    });
    const chartRef = ref(null);

    onMounted(async () => {
      try {
        const { data: res } = await api.get('/admin/dashboard');
        Object.assign(data, res);
      } finally {
        loading.value = false;
      }
      Vue.nextTick(() => {
        if (!chartRef.value) return;
        new Chart(chartRef.value, {
          type: 'doughnut',
          data: {
            labels: Object.keys(data.students_by_branch),
            datasets: [{
              data: Object.values(data.students_by_branch),
              backgroundColor: ['#14213D', '#FCA311', '#2E7D5B', '#5A2FA6', '#2A4C9B', '#C1443C', '#8892A0', '#B4790A'],
            }],
          },
          options: { plugins: { legend: { position: 'right' } } },
        });
      });
    });

    return { loading, data, chartRef };
  },
};

/* ---------------------------------------------------------------------------
 * Companies moderation
 * ------------------------------------------------------------------------- */
export const AdminCompanies = {
  name: 'AdminCompanies',
  components: { StatusBadge },
  template: `
    <div>
      <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <h3 class="mb-0">Companies</h3>
        <div class="d-flex gap-2">
          <select class="form-select" style="width:180px;" v-model="statusFilter" @change="load">
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
          <input class="form-control" style="width:220px;" placeholder="Search..." v-model="q" @input="debouncedLoad" />
        </div>
      </div>

      <div v-if="loading" class="pt-spinner-wrap"><div class="spinner-border"></div></div>
      <div v-else class="table-responsive pt-card p-3">
        <table class="table pt-table align-middle mb-0">
          <thead><tr><th>Company</th><th>Contact</th><th>Status</th><th>Account</th><th></th></tr></thead>
          <tbody>
            <tr v-for="c in companies" :key="c.id">
              <td>
                <div class="fw-semibold">{{ c.company_name }}</div>
                <div class="text-muted small">{{ c.industry || '—' }}</div>
              </td>
              <td class="small">{{ c.hr_contact_name }}<br><span class="text-muted">{{ c.email }}</span></td>
              <td><span class="pt-badge" :class="'pt-badge-' + c.approval_status">{{ c.approval_status }}</span></td>
              <td>
                <span v-if="c.is_blacklisted" class="badge text-bg-danger">Blacklisted</span>
                <span v-else-if="!c.is_active" class="badge text-bg-secondary">Deactivated</span>
                <span v-else class="badge text-bg-success">Active</span>
              </td>
              <td class="text-end">
                <div class="btn-group btn-group-sm">
                  <button v-if="c.approval_status === 'pending'" class="btn btn-pt-primary" @click="approve(c)">Approve</button>
                  <button v-if="c.approval_status === 'pending'" class="btn btn-outline-danger" @click="reject(c)">Reject</button>
                  <button v-if="!c.is_blacklisted" class="btn btn-outline-danger" @click="blacklist(c)">Blacklist</button>
                  <button v-else class="btn btn-pt-outline" @click="reactivate(c)">Reactivate</button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
  setup() {
    const companies = ref([]);
    const loading = ref(true);
    const statusFilter = ref('');
    const q = ref('');
    let timer = null;

    async function load() {
      loading.value = true;
      try {
        const { data } = await api.get('/admin/companies', { params: { status: statusFilter.value, q: q.value } });
        companies.value = data.companies;
      } finally {
        loading.value = false;
      }
    }
    function debouncedLoad() { clearTimeout(timer); timer = setTimeout(load, 300); }

    async function approve(c) {
      await api.post(`/admin/companies/${c.id}/approve`);
      pushToast(`${c.company_name} approved.`);
      load();
    }
    async function reject(c) {
      const reason = prompt('Reason for rejection (optional):') || '';
      await api.post(`/admin/companies/${c.id}/reject`, { reason });
      pushToast(`${c.company_name} rejected.`);
      load();
    }
    async function blacklist(c) {
      const reason = prompt('Reason for blacklisting:') || 'Policy violation.';
      await api.post(`/admin/companies/${c.id}/blacklist`, { reason });
      pushToast(`${c.company_name} blacklisted.`);
      load();
    }
    async function reactivate(c) {
      await api.post(`/admin/companies/${c.id}/reactivate`);
      pushToast(`${c.company_name} reactivated.`);
      load();
    }

    onMounted(load);
    return { companies, loading, statusFilter, q, load, debouncedLoad, approve, reject, blacklist, reactivate };
  },
};

/* ---------------------------------------------------------------------------
 * Students moderation
 * ------------------------------------------------------------------------- */
export const AdminStudents = {
  name: 'AdminStudents',
  template: `
    <div>
      <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <h3 class="mb-0">Students</h3>
        <input class="form-control" style="width:260px;" placeholder="Search name, email, roll no..." v-model="q" @input="debouncedLoad" />
      </div>

      <div v-if="loading" class="pt-spinner-wrap"><div class="spinner-border"></div></div>
      <div v-else class="table-responsive pt-card p-3">
        <table class="table pt-table align-middle mb-0">
          <thead><tr><th>Student</th><th>Branch / Batch</th><th>CGPA</th><th>Account</th><th></th></tr></thead>
          <tbody>
            <tr v-for="s in students" :key="s.id">
              <td>
                <div class="fw-semibold">{{ s.name }}</div>
                <div class="text-muted small pt-mono">{{ s.roll_number }} &middot; {{ s.email }}</div>
              </td>
              <td class="small">{{ s.branch }}<br><span class="text-muted">Batch {{ s.graduation_year }}</span></td>
              <td>{{ s.cgpa }}</td>
              <td>
                <span v-if="s.is_blacklisted" class="badge text-bg-danger">Blacklisted</span>
                <span v-else-if="!s.is_active" class="badge text-bg-secondary">Deactivated</span>
                <span v-else class="badge text-bg-success">Active</span>
              </td>
              <td class="text-end">
                <button v-if="!s.is_blacklisted" class="btn btn-sm btn-outline-danger" @click="blacklist(s)">Blacklist</button>
                <button v-else class="btn btn-sm btn-pt-outline" @click="reactivate(s)">Reactivate</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
  setup() {
    const students = ref([]);
    const loading = ref(true);
    const q = ref('');
    let timer = null;

    async function load() {
      loading.value = true;
      try {
        const { data } = await api.get('/admin/students', { params: { q: q.value } });
        students.value = data.students;
      } finally {
        loading.value = false;
      }
    }
    function debouncedLoad() { clearTimeout(timer); timer = setTimeout(load, 300); }

    async function blacklist(s) {
      const reason = prompt('Reason for blacklisting:') || 'Policy violation.';
      await api.post(`/admin/students/${s.id}/blacklist`, { reason });
      pushToast(`${s.name} blacklisted.`);
      load();
    }
    async function reactivate(s) {
      await api.post(`/admin/students/${s.id}/reactivate`);
      pushToast(`${s.name} reactivated.`);
      load();
    }

    onMounted(load);
    return { students, loading, q, debouncedLoad, blacklist, reactivate };
  },
};

/* ---------------------------------------------------------------------------
 * Drives moderation
 * ------------------------------------------------------------------------- */
export const AdminDrives = {
  name: 'AdminDrives',
  components: { StatusBadge },
  template: `
    <div>
      <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <h3 class="mb-0">Placement drives</h3>
        <select class="form-select" style="width:180px;" v-model="statusFilter" @change="load">
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      <div v-if="loading" class="pt-spinner-wrap"><div class="spinner-border"></div></div>
      <div v-else-if="drives.length === 0" class="pt-empty-state">
        <i class="bi bi-briefcase fs-1" style="color:var(--pt-amber);"></i>
        <h5 class="mt-3">No drives found</h5>
      </div>
      <div v-else class="d-flex flex-column gap-3">
        <div class="pt-card p-3" v-for="d in drives" :key="d.id">
          <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
            <div>
              <h6 class="mb-0">{{ d.job_title }} <span class="text-muted small">@ {{ d.company_name }}</span></h6>
              <div class="text-muted small">
                Deadline {{ d.application_deadline }} &middot; Min CGPA {{ d.min_cgpa }} &middot; {{ d.applicant_count }} applicant(s)
              </div>
            </div>
            <status-badge :status="d.status" />
          </div>
          <div class="d-flex flex-wrap gap-2 mt-2">
            <button v-if="d.status === 'pending'" class="btn btn-sm btn-pt-primary" @click="approve(d)">Approve</button>
            <button v-if="d.status === 'pending'" class="btn btn-sm btn-outline-danger" @click="reject(d)">Reject</button>
          </div>
        </div>
      </div>
    </div>
  `,
  setup() {
    const drives = ref([]);
    const loading = ref(true);
    const statusFilter = ref('');

    async function load() {
      loading.value = true;
      try {
        const { data } = await api.get('/admin/drives', { params: { status: statusFilter.value } });
        drives.value = data.drives;
      } finally {
        loading.value = false;
      }
    }
    async function approve(d) {
      await api.post(`/admin/drives/${d.id}/approve`);
      pushToast(`Drive "${d.job_title}" approved.`);
      load();
    }
    async function reject(d) {
      const reason = prompt('Reason for rejection (optional):') || '';
      await api.post(`/admin/drives/${d.id}/reject`, { reason });
      pushToast(`Drive "${d.job_title}" rejected.`);
      load();
    }

    onMounted(load);
    return { drives, loading, statusFilter, load, approve, reject };
  },
};

/* ---------------------------------------------------------------------------
 * Reports (monthly PDF activity report — optional feature)
 * ------------------------------------------------------------------------- */
export const AdminReports = {
  name: 'AdminReports',
  template: `
    <div>
      <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <div>
          <h3 class="mb-0">Monthly activity reports</h3>
          <p class="text-muted mb-0">Auto-generated on the 1st of every month. Generate one on demand below.</p>
        </div>
        <div class="d-flex gap-2">
          <input type="month" class="form-control" v-model="monthInput" />
          <button class="btn btn-pt-amber" @click="generate" :disabled="generating">
            <span v-if="generating" class="spinner-border spinner-border-sm me-1"></span>
            Generate now
          </button>
        </div>
      </div>

      <div v-if="loading" class="pt-spinner-wrap"><div class="spinner-border"></div></div>
      <div v-else-if="reports.length === 0" class="pt-empty-state">
        <i class="bi bi-file-earmark-bar-graph fs-1" style="color:var(--pt-amber);"></i>
        <h5 class="mt-3">No reports generated yet</h5>
      </div>
      <div v-else class="table-responsive pt-card p-3">
        <table class="table pt-table align-middle mb-0">
          <thead><tr><th>Period</th><th>Drives</th><th>Applied</th><th>Selected</th><th></th></tr></thead>
          <tbody>
            <tr v-for="r in reports" :key="r.id">
              <td class="pt-mono">{{ r.month }}/{{ r.year }}</td>
              <td>{{ r.drives_conducted }}</td>
              <td>{{ r.students_applied }}</td>
              <td>{{ r.students_selected }}</td>
              <td class="text-end">
                <a class="btn btn-sm btn-pt-outline" href="#" @click.prevent="downloadReport(r)">
                  <i class="bi bi-file-earmark-pdf"></i> Download PDF
                </a>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  `,
  setup() {
    const reports = ref([]);
    const loading = ref(true);
    const generating = ref(false);
    const now = new Date();
    const monthInput = ref(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);

    async function load() {
      loading.value = true;
      try {
        const { data } = await api.get('/admin/reports/monthly');
        reports.value = data.reports;
      } finally {
        loading.value = false;
      }
    }

    async function generate() {
      const [year, month] = monthInput.value.split('-').map(Number);
      generating.value = true;
      try {
        const { data } = await api.post('/admin/reports/monthly/generate', { month, year });
        pushToast('Report generation started...');
        poll(data.task_id);
      } catch (e) {
        pushToast(errorMessage(e), 'error');
        generating.value = false;
      }
    }
    function poll(taskId) {
      const timer = setInterval(async () => {
        const { data } = await api.get(`/admin/reports/monthly/task-status/${taskId}`);
        if (data.state === 'SUCCESS') {
          clearInterval(timer);
          generating.value = false;
          pushToast('Report generated!');
          load();
        } else if (data.state === 'FAILURE') {
          clearInterval(timer);
          generating.value = false;
          pushToast('Report generation failed.', 'error');
        }
      }, 1200);
    }

    async function downloadReport(report) {
      try {
        await downloadFile(
          `/admin/reports/monthly/${report.id}/download`,
          `placetrack_report_${report.year}_${String(report.month).padStart(2, '0')}.pdf`
        );
      } catch (e) {
        pushToast(errorMessage(e, 'Could not download the report.'), 'error');
      }
    }

    onMounted(load);
    return { reports, loading, generating, monthInput, generate, downloadReport };
  },
};
