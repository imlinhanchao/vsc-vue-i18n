<script setup lang="ts">
import { useMessage } from '@/hooks/useMessage';
import { nextTick, ref, watch } from 'vue';
import Icon from '@/components/Icon';
import { clone } from '@/utils/base';
import { ElTable } from 'element-plus';

export interface IMatchPos {
  line: number;
  index: number;
}

export interface ILangData {
  id: number;
  result: string;
  isloading: boolean;
  key: string;
  value: string;
  pos: IMatchPos[];
  type: string;
}

const langs = ref<ILangData[]>();
const tableRef = ref<InstanceType<typeof ElTable>>();
const { addMsgListener, postMsg, invoke } = useMessage();
addMsgListener('data', (data: ILangData[]) => {
  langs.value = data;
});
addMsgListener('push', (data: ILangData) => {
  langs.value?.push(data);
  nextTick(() => {
    tableRef.value?.setScrollTop(9999);
  });
});
postMsg('data');

watch(langs, (newVal) => {
  if (newVal) {
    postMsg('update', clone(newVal));
  }
});

function updateLangs(row: ILangData) {
  postMsg('update:item', clone(row));
}

function removeLangs(index: number) {
  const [lang] = langs.value!.splice(index, 1);
  postMsg('remove:item', clone(lang));
}

function getKey(words: string) {
  let keys: string[] = words
    .replace(/[\s\/]+/g, '_')
    .replace(/[^\w]/g, '')
    .trim()
    .toLowerCase()
    .split('_');
  // 缩key为最多3个单词
  let key = keys.slice(0, 3).join('_');
  if (!key) return key;
  keys = keys.slice(3);
  while (langs.value?.find((l) => l.key == key) && keys.length > 0) {
    key += '_' + keys.shift();
  }
  // 检查key是否重复
  const count = langs.value?.filter((l) => l.key.replace(/\d+$/, '') == key).length ?? 0;
  if (count > 0) {
    key += count;
  }
  return key;
}

const isKeyLoading = ref(false);
function generateKey(row?: ILangData) {
  if (row) {
    if (row.result) {
      row.key = getKey(row.result);
      return;
    }
    row.isloading = true;
    invoke('translate', {
      texts: [row.value],
      from: 'zh',
      to: 'en'
    }).then((rsp) => {
      row.result = rsp.items[0].dst;
      row.key = getKey(rsp.items[0].dst);
      row.isloading = false;
      postMsg('update:item', clone(row));
    });
  } else {
    const texts = langs.value?.filter((l) => !l.key && !l.result).map((l) => l.value);
    if (!texts?.length) return;
    isKeyLoading.value = true;
    invoke('translate', {
      texts,
      from: 'zh',
      to: 'en'
    }).then((rsp) => {
      langs.value?.forEach((row) => {
        if (row.key) return;
        if (row.result) {
          row.key = getKey(row.result);
          return;
        }
        const item = rsp.items.find((i) => i.src == row.value);
        row.key = getKey(item?.dst);
        row.result = item?.dst;
      });
      isKeyLoading.value = false;
      postMsg('update', clone(langs.value));
    });
  }
}

function batRemove() {
  const selections = tableRef.value?.getSelectionRows();
  selections!.forEach((s: ILangData) => removeLangs(langs.value!.indexOf(s)));
}

const exportLoading = ref(false);
function exportLangs() {
  exportLoading.value = true;
  invoke('export').then(() => {
    exportLoading.value = false;
  });
}
function appendLangs() {
  exportLoading.value = true;
  invoke('append').then(() => {
    exportLoading.value = false;
  });
}
</script>

<template>
  <el-container>
    <el-header class="space-x-3">
      <el-tooltip content="导出国际化文件" placement="top">
        <el-button type="primary" link :loading="exportLoading" @click="exportLangs" size="large">
          <Icon v-if="!exportLoading" icon="uil:file-export" :size="20" />
        </el-button>
      </el-tooltip>
      <el-tooltip content="追加到国际化文件" placement="top">
        <el-button type="primary" link :loading="exportLoading" @click="appendLangs" size="large">
          <Icon v-if="!exportLoading" icon="streamline:file-add-alternate" :size="20" />
        </el-button>
      </el-tooltip>
      <el-tooltip content="删除选中项目" placement="top">
        <span>
          <el-popconfirm title="确认删除已选项目吗？" @confirm="batRemove">
            <template #reference>
              <el-button
                class="text-[20px]"
                type="danger"
                link
                icon="el-icon-delete"
                size="large"
              />
            </template>
          </el-popconfirm>
        </span>
      </el-tooltip>
    </el-header>
    <el-main>
      <el-table ref="tableRef" :data="langs" style="width: 100%" height="100%">
        <el-table-column type="selection" width="50" />
        <el-table-column align="center" prop="key" label="国际化 Key">
          <template #header>
            <section class="flex items-center justify-center">
              <span>国际化 Key</span>
              <el-tooltip content="自动生成 Key" placement="top">
                <el-button :loading="isKeyLoading" @click="generateKey()" link>
                  <Icon icon="mdi:magic" />
                </el-button>
              </el-tooltip>
            </section>
          </template>
          <template #default="{ row }">
            <el-input v-model="row.key" @change="updateLangs(row)">
              <template #suffix>
                <el-tooltip content="自动生成 Key" placement="top">
                  <el-button
                    :loading="isKeyLoading || row.isloading"
                    @click="generateKey(row)"
                    link
                  >
                    <Icon icon="mdi:magic" />
                  </el-button>
                </el-tooltip>
              </template>
            </el-input>
          </template>
        </el-table-column>
        <el-table-column align="center" prop="value" label="值">
          <template #default="{ row }">
            <el-input
              v-model="row.value"
              type="textarea"
              :autosize="{
                minRows: 1
              }"
              @change="updateLangs(row)"
              readonly
            />
          </template>
        </el-table-column>
        <el-table-column label="操作" width="100" align="center">
          <template #default="{ row, $index }">
            <el-tooltip content="删除" placement="top">
              <span>
                <el-popconfirm title="确认删除吗？" @confirm="removeLangs($index)">
                  <template #reference>
                    <el-button type="danger" link size="small" icon="el-icon-delete" />
                  </template>
                </el-popconfirm>
              </span>
            </el-tooltip>
            <el-tooltip content="跳转到第一个匹配行" placement="top">
              <el-button type="primary" link size="small">
                <Icon
                  icon="system-uicons:jump-right"
                  @click="postMsg('jumpto', row.pos[0].start.line)"
                />
              </el-button>
            </el-tooltip>
          </template>
        </el-table-column>
      </el-table>
    </el-main>
  </el-container>
</template>
<style lang="less" scoped>
.el-header {
  display: flex;
  justify-content: flex-end;
  margin-right: 20px;
}
</style>
