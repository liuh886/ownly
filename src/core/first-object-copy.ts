import type { WYQDLanguage } from './i18n';

export type FirstObjectChoice = 'physical' | 'recurring_cost' | 'experience';

interface FirstObjectChoiceCopy {
  title: string;
  description: string;
  example: string;
}

export interface FirstObjectCopy {
  eyebrow: string;
  title: string;
  description: string;
  localNote: string;
  choices: Record<FirstObjectChoice, FirstObjectChoiceCopy>;
  dismiss: string;
  reopen: string;
  emptyTitle: string;
  emptyDescription: string;
}

const COPY: Record<WYQDLanguage, FirstObjectCopy> = {
  en: {
    eyebrow: 'Your data is ready',
    title: 'Record your first real object',
    description: 'Start with one thing that is genuinely useful to remember. This creates a normal Ownly Markdown record, not demo data.',
    localNote: 'The record is saved in your Ownly data folder and remains editable in Web, PWA, Obsidian, and the Agent CLI.',
    choices: {
      physical: {
        title: 'Physical item',
        description: 'A possession you are considering, using, or preparing to exit.',
        example: 'Example: camera, laptop, bicycle',
      },
      recurring_cost: {
        title: 'Recurring cost',
        description: 'A subscription or other repeating obligation worth reviewing.',
        example: 'Example: cloud storage, software, membership',
      },
      experience: {
        title: 'Experience or plan',
        description: 'A trip, event, meal, or other finite experience.',
        example: 'Example: weekend trip, concert, course',
      },
    },
    dismiss: 'Not now',
    reopen: 'Create first object',
    emptyTitle: 'Your Ownly data folder is empty',
    emptyDescription: 'Create one real record to complete setup. No demo records will be written automatically.',
  },
  zh: {
    eyebrow: '本地数据已经就绪',
    title: '记录第一个真实对象',
    description: '从一件真正值得记住的事物开始。系统会创建一条正常的 Ownly Markdown 记录，而不是演示数据。',
    localNote: '记录保存在 Ownly 数据目录中，可继续通过 Web、PWA、Obsidian 和 Agent CLI 使用。',
    choices: {
      physical: {
        title: '实体物品',
        description: '正在考虑购买、已经使用，或准备退出的一件物品。',
        example: '例如：相机、电脑、自行车',
      },
      recurring_cost: {
        title: '周期性支出',
        description: '值得持续审视的一项订阅或重复性支出。',
        example: '例如：云存储、软件、会员',
      },
      experience: {
        title: '体验或计划',
        description: '一次旅行、活动、用餐或其它有限期体验。',
        example: '例如：周末旅行、演出、课程',
      },
    },
    dismiss: '暂时不用',
    reopen: '创建第一个对象',
    emptyTitle: 'Ownly 数据目录目前为空',
    emptyDescription: '创建一条真实记录即可完成设置。系统不会自动写入演示数据。',
  },
};

export function getFirstObjectCopy(language: WYQDLanguage): FirstObjectCopy {
  return COPY[language];
}
