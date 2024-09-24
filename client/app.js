import frontMatter from 'front-matter';
import Mustache from 'mustache';
import { marked } from 'marked';
import { gfmHeadingId } from 'marked-gfm-heading-id';
import postcss from 'postcss';
import cssnano from 'cssnano';

import { writeFile } from '../lib/file.js';

marked.use(gfmHeadingId({ prefix: '' }));

const cssNano = postcss([cssnano]);

export const pipe = (initial, transforms) => {
  return transforms.reduce((result, transform) => transform(result), initial);
};

export const renderMustache = Mustache.render;

export const renderMD = (fileContent) => {
  return marked.parse(fileContent, { gfm: true });
};

export const renderCards = (fileContent) => {
  const open = '<p>(~</p>', close = '<p>~)</p>';

  return fileContent
    .replaceAll(open, '<div class="card">')
    .replaceAll(close, '</div>');
};

export const minifyCSS = async (fileContent) => {
  return await cssNano.process(fileContent, { from: undefined }).then(({ css }) => css);
};

export const parseMetadata = (fileContent) => {
  const { attributes: meta, body: content } = frontMatter(fileContent);

  return { meta, content };
};

export const renderAndWritePage = (uri, shell, partials, pageData, fileContent) => {
  const fileName = `dist/${uri}`;
  const output = pipe(fileContent, [
    (text) => renderMustache(text, pageData, partials),
    (text) => parseMetadata(text),
    ({ meta, content }) => ({ meta, content: renderMD(content) }),
    ({ meta, content }) => ({ meta, content: renderCards(content) }),
    ({ meta, content }) => renderMustache(shell, { meta, pageData }, { ...partials, content })
  ]);

  console.log(`Writing File: ${fileName}`);

  writeFile(fileName, output);
};