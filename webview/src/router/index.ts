import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/home/index.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView
    },
  ]
})

export default router
