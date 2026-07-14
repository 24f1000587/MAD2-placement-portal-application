import { router } from './router.js';
import { ToastStack } from './components/common.js';

const RootApp = {
  name: 'RootApp',
  components: { ToastStack },
  template: `
    <div>
      <router-view />
      <toast-stack />
    </div>
  `,
};

const app = Vue.createApp(RootApp);
app.use(router);
app.mount('#app');
