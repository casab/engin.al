import type { Site, SocialObjects } from "./types";

export const SITE: Site = {
  website: "https://engin.al/", // replace this with your deployed domain
  author: "Engin Al",
  profile: "https://satnaing.dev/",
  desc: "Personal blog of Engin Al",
  title: "Engin Al's Blog",
  ogImage: "engin-og.jpg",
  lightAndDarkMode: true,
  postPerIndex: 4,
  postPerPage: 5,
  scheduledPostMargin: 15 * 60 * 1000, // 15 minutes
  showArchives: true,
  editPost: {
    url: "https://github.com/satnaing/astro-paper/edit/main/src/content/blog",
    text: "Suggest Changes",
    appendFilePath: true,
  },
};

export const LOCALE = {
  lang: "en", // html lang code. Set this empty and default will be "en"
  langTag: ["en-EN"], // BCP 47 Language Tags. Set this empty [] to use the environment default
} as const;

export const LOGO_IMAGE = {
  enable: false,
  svg: true,
  width: 216,
  height: 46,
};

export const SOCIALS: SocialObjects = [
  {
    name: "Github",
    href: "https://github.com/casab",
    linkTitle: ` ${SITE.title} on Github`,
    active: true,
  },
  {
    name: "Instagram",
    href: "https://instagram.com/etikmaske",
    linkTitle: `${SITE.title} on Instagram`,
    active: true,
  },
  {
    name: "LinkedIn",
    href: "https://www.linkedin.com/in/enginal",
    linkTitle: `${SITE.title} on LinkedIn`,
    active: true,
  },
  {
    name: "Mail",
    href: "mailto:enginal@gmail.com",
    linkTitle: `Send an email to ${SITE.title}`,
    active: false,
  },
  {
    name: "Twitter",
    href: "https://github.com/etikmaske",
    linkTitle: `${SITE.title} on Twitter`,
    active: false,
  },
  {
    name: "Mastodon",
    href: "https://mastodon.social/@enginal",
    linkTitle: `${SITE.title} on Mastodon`,
    active: false,
  },
];
