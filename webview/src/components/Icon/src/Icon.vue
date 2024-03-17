<script setup lang="ts">
import { computed, unref, ref, watch, nextTick, RenderFunction } from 'vue';
import { ElIcon } from 'element-plus';
import Iconify from '@purge-icons/generated';
import { isString, isObject, isFunction } from '@/utils';

const props = withDefaults(
  defineProps<{
    icon: string | Recordable | RenderFunction;
    // icon color
    color?: string;
    // icon size
    size?: number;
  }>(),
  {
    icon: '',
    size: 16
  }
);

const elRef = ref<ElRef>(null);

const isRenderable = computed(
  () =>
    isObject(props.icon) ||
    isFunction(props.icon) ||
    (isString(props.icon) && props.icon.startsWith(`el-icon-`))
);

const isLocal = computed(() => isString(props.icon) && props.icon.startsWith('svg-icon:'));

const symbolId = computed(() => {
  return isString(props.icon) && unref(isLocal)
    ? `#icon-${props.icon.split('svg-icon:')[1]}`
    : props.icon;
});

const getIconifyStyle = computed(() => {
  const { color, size } = props;
  return {
    fontSize: `${size}px`,
    color
  };
});

const updateIcon = async (icon: string | Recordable | Function) => {
  if (unref(isRenderable)) return;
  if (unref(isLocal)) return;

  const el = unref(elRef);
  if (!el) return;

  await nextTick();

  if (!icon || !isString(icon)) return;

  const svg = Iconify.renderSVG(icon, {});
  if (svg) {
    el.textContent = '';
    el.appendChild(svg);
  } else {
    const span = document.createElement('span');
    span.className = 'iconify';
    span.dataset.icon = icon;
    el.textContent = '';
    el.appendChild(span);
  }
};

watch(
  () => props.icon,
  (icon: string | Recordable | Function) => {
    updateIcon(icon);
  }
);
</script>

<template>
  <ElIcon :size="size" :color="color">
    <component v-if="isRenderable" :is="icon" />

    <svg v-else-if="isLocal" aria-hidden="true">
      <use :xlink:href="symbolId" />
    </svg>

    <span v-else ref="elRef" :class="$attrs.class" :style="getIconifyStyle">
      <span class="iconify" :data-icon="symbolId"></span>
    </span>
  </ElIcon>
</template>
