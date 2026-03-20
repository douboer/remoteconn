<template>
  <section class="page-root about-page-web">
    <div class="page-toolbar">
      <div class="toolbar-left">
        <button
          v-if="isDetailView"
          class="icon-btn"
          type="button"
          title="返回关于首页"
          aria-label="返回关于首页"
          @click="goAboutHome"
        >
          <span class="icon-mask" style="--icon: url(&quot;/icons/back.svg&quot;)" aria-hidden="true"></span>
        </button>
      </div>
      <div class="toolbar-spacer"></div>
      <h2 class="page-title">{{ pageTitle }}</h2>
      <div class="toolbar-right about-toolbar-actions">
        <button
          v-if="isDetailView"
          class="icon-btn"
          type="button"
          title="分享当前页面"
          aria-label="分享当前页面"
          @click="shareCurrentPage"
        >
          <span class="icon-mask" style="--icon: url(&quot;/icons/share.svg&quot;)" aria-hidden="true"></span>
        </button>
      </div>
    </div>

    <div class="about-scroll-web surface-scroll">
      <div class="about-shell-web">
        <div class="about-bg-orb-web about-bg-orb-web-left"></div>
        <div class="about-bg-orb-web about-bg-orb-web-right"></div>

        <div v-if="!isDetailView" class="about-stack-web">
          <section class="about-hero-web">
            <img class="about-home-logo-web" src="/brand/logo.svg" alt="RemoteConn 标志" />
            <img class="about-home-wordmark-web" src="/brand/remoteconn.svg" alt="RemoteConn" />
            <img class="about-home-submark-web" src="/brand/ai矩连.svg" alt="AI 矩连" />
            <p class="about-home-version-web">{{ ABOUT_BRAND.version }}</p>
            <p class="about-home-summary-web">{{ ABOUT_BRAND.summary }}</p>
          </section>

          <section class="about-card-list-web" aria-label="关于页面入口">
            <button
              v-for="item in ABOUT_HOME_ITEMS"
              :key="item.key"
              class="about-entry-web"
              type="button"
              @click="openDetail(item.key)"
            >
              <span class="about-entry-main-web">
                <span class="about-entry-title-web">{{ item.title }}</span>
              </span>
              <span class="about-entry-arrow-web" aria-hidden="true">›</span>
            </button>
          </section>
        </div>

        <div v-else-if="activeDetailKey === 'app'" class="about-app-stack-web">
          <section class="about-app-brand-web">
            <img class="about-home-logo-web" src="/brand/logo.svg" alt="RemoteConn 标志" />
            <img class="about-home-wordmark-web" src="/brand/remoteconn.svg" alt="RemoteConn" />
            <img class="about-home-submark-web" src="/brand/ai矩连.svg" alt="AI 矩连" />
            <p class="about-app-version-web">{{ appVersionLine }}</p>
          </section>

          <article class="about-app-card-web">
            <h3 class="about-app-card-title-web">{{ activeContent.sections[0]?.title }}</h3>
            <p v-if="activeContent.lead" class="about-app-card-lead-web">{{ activeContent.lead }}</p>
            <div class="about-app-info-list-web">
              <div v-for="row in aboutInfoRows" :key="row.key" class="about-app-info-row-web">
                <span v-if="row.label" class="about-app-info-label-web">{{ row.label }}</span>
                <span class="about-app-info-value-web">{{ row.value }}</span>
              </div>
            </div>
          </article>

          <div class="about-app-footer-web">
            <button class="about-link-btn-web" type="button" @click="openDetail('manual')">使用说明</button>
            <button class="about-link-btn-web" type="button" @click="openDetail('privacy')">隐私政策</button>
          </div>
        </div>

        <div v-else class="about-stack-web">
          <div class="detail-chip-web">{{ ABOUT_BRAND.chineseName }}</div>
          <article class="detail-card-web">
            <h3 class="detail-title-web">{{ activeContent.title }}</h3>
            <p class="detail-lead-web">{{ activeContent.lead }}</p>
          </article>

          <article
            v-for="section in activeContent.sections"
            :key="section.title"
            class="detail-card-web detail-section-list-web"
          >
            <div class="detail-section-head-web">
              <h4 class="detail-section-title-web">{{ section.title }}</h4>
              <button
                v-if="section.actionLabel"
                class="detail-action-btn-web"
                type="button"
                @click="copyFeedbackEmail"
              >
                {{ section.actionLabel }}
              </button>
            </div>
            <p v-for="paragraph in section.paragraphs" :key="paragraph" class="detail-paragraph-web">
              {{ paragraph }}
            </p>
            <div v-if="section.bullets?.length" class="detail-bullet-list-web">
              <div v-for="bullet in section.bullets" :key="bullet" class="detail-bullet-row-web">
                <span class="detail-bullet-dot-web">•</span>
                <span class="detail-bullet-text-web">{{ bullet }}</span>
              </div>
            </div>
          </article>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAppStore } from "@/stores/appStore";
import {
  ABOUT_BRAND,
  ABOUT_HOME_ITEMS,
  buildAboutInfoRows,
  getAboutDetailContent,
  isAboutDetailKey,
  type AboutDetailKey
} from "@/content/about";

const route = useRoute();
const router = useRouter();
const appStore = useAppStore();

const activeDetailKey = computed<AboutDetailKey | null>(() => {
  const raw = String(route.params.section ?? "").trim();
  if (!raw) {
    return null;
  }
  return isAboutDetailKey(raw) ? raw : null;
});

const isDetailView = computed(() => activeDetailKey.value !== null);
const activeContent = computed(() => getAboutDetailContent(activeDetailKey.value ?? "app"));
const pageTitle = computed(() => (activeDetailKey.value ? activeContent.value.title : "关于"));
const aboutInfoRows = computed(() => buildAboutInfoRows(getAboutDetailContent("app")));
const appVersionLine = computed(() => `${ABOUT_BRAND.version} · web · ${ABOUT_BRAND.updatedAtCompact}`);

function openDetail(key: AboutDetailKey): Promise<void> {
  return router.push(`/about/${key}`).then(() => undefined);
}

function goAboutHome(): Promise<void> {
  return router.push("/about").then(() => undefined);
}

async function copyFeedbackEmail(): Promise<void> {
  try {
    await navigator.clipboard.writeText(ABOUT_BRAND.feedbackEmail);
    appStore.notify("info", "反馈邮箱已复制");
  } catch {
    appStore.notify("error", "复制邮箱失败，请手动复制");
  }
}

/**
 * Web 端优先走原生 share，浏览器不支持时回退为复制当前链接。
 */
async function shareCurrentPage(): Promise<void> {
  const sharePayload = {
    title: `${ABOUT_BRAND.productName} ${ABOUT_BRAND.version}`,
    text: ABOUT_BRAND.summary,
    url: window.location.href
  };

  try {
    if (navigator.share) {
      await navigator.share(sharePayload);
      return;
    }
    await navigator.clipboard.writeText(sharePayload.url);
    appStore.notify("info", "页面链接已复制");
  } catch {
    appStore.notify("error", "分享失败，请稍后重试");
  }
}
</script>
