export default {
  layout: "layouts/project.njk",
  eleventyComputed: {
    channel: (data) => (data.channels && data.channels[0]) || "code",
  },
};
