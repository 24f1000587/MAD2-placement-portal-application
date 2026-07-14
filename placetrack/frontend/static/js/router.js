import { Home, NotFound, DashboardLayout } from './components/common.js';
import { Login, RegisterStudent, RegisterCompany } from './components/auth.js';
import {
  StudentDashboard, DriveBrowse, DriveDetail, MyApplications, PlacementHistory, StudentProfile,
} from './components/student.js';
import {
  CompanyDashboard, CreateDrive, ManageDrives, DriveApplicants, CompanyProfileView,
} from './components/company.js';
import {
  AdminDashboard, AdminCompanies, AdminStudents, AdminDrives, AdminReports,
} from './components/admin.js';
import { authStore } from './store.js';

const routes = [
  { path: '/', component: Home },
  { path: '/login', component: Login, meta: { guestOnly: true } },
  { path: '/register/student', component: RegisterStudent, meta: { guestOnly: true } },
  { path: '/register/company', component: RegisterCompany, meta: { guestOnly: true } },

  {
    path: '/student',
    component: DashboardLayout,
    meta: { requiresAuth: true, role: 'student' },
    children: [
      { path: 'dashboard', component: StudentDashboard },
      { path: 'drives', component: DriveBrowse },
      { path: 'drives/:id', component: DriveDetail },
      { path: 'applications', component: MyApplications },
      { path: 'history', component: PlacementHistory },
      { path: 'profile', component: StudentProfile },
    ],
  },
  {
    path: '/company',
    component: DashboardLayout,
    meta: { requiresAuth: true, role: 'company' },
    children: [
      { path: 'dashboard', component: CompanyDashboard },
      { path: 'drives', component: ManageDrives },
      { path: 'drives/new', component: CreateDrive },
      { path: 'drives/:id/applicants', component: DriveApplicants },
      { path: 'profile', component: CompanyProfileView },
    ],
  },
  {
    path: '/admin',
    component: DashboardLayout,
    meta: { requiresAuth: true, role: 'admin' },
    children: [
      { path: 'dashboard', component: AdminDashboard },
      { path: 'companies', component: AdminCompanies },
      { path: 'students', component: AdminStudents },
      { path: 'drives', component: AdminDrives },
      { path: 'reports', component: AdminReports },
    ],
  },

  { path: '/:pathMatch(.*)*', component: NotFound },
];

export const router = VueRouter.createRouter({
  history: VueRouter.createWebHashHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 };
  },
});

router.beforeEach((to) => {
  if (to.meta.requiresAuth && !authStore.token) {
    return '/login';
  }
  if (to.meta.role && authStore.user && authStore.user.role !== to.meta.role) {
    return authStore.user.role ? `/${authStore.user.role}/dashboard` : '/login';
  }
  if (to.meta.guestOnly && authStore.token) {
    return authStore.user ? `/${authStore.user.role}/dashboard` : '/';
  }
  return true;
});
