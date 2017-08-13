import * as xml2js from 'xml2js'
import * as toMarkdown from 'to-markdown'
import * as fs from 'fs'
import { kebabCase } from 'lodash'

run()

interface WPPost {
  'wp:post_id': [string]
  title: [string]
  'wp:post_date': [string]
  'wp:post_name': [string]
  'content:encoded': [string]
  'wp:post_parent': [string]
  'wp:post_type': [('post' | 'page' | 'nav_menu_item' | 'attachment')]
  'wp:postmeta': WPPostMeta[]
}

interface WPPostPost extends WPPost {
  'wp:post_type': ['post']
  category: WPCategory[]
}

interface WPPostAttachment extends WPPost {
  'wp:post_type': ['attachment']
  'wp:attachment_url': [string]
}

interface WPPostMeta {
  'wp:meta_key': [string]
  'wp:meta_value': [string]
}

interface WPCategory {
  _: string
  $: { domain: 'post_tag' | 'category', nicename: string }
}

interface Taxonomy {
  name: string,
  slug: string
}

interface Post {
  id: number
  title: string
  slug: string
  content: string
  date: string
  categories: Taxonomy[]
  tags: Taxonomy[]
  attachments: string[]
  meta: WPPostMeta[]
  thumbnail?: string
}

async function run() {
  const xml = await getXml()
  const wpPosts = await parseXml(xml)
  const processAttachments = (post: Post) => attachAttachments(wpPosts, post)
  const addThumb = (post: Post) => {
    const thumbnail = getPostThumbnail(wpPosts, post.meta)
    if (!thumbnail) {
      return post
    }
    return { ...post, thumbnail }
  }


  const posts = await Promise.all(
    wpPosts
      .filter(<(p) => p is WPPostPost>(p => p['wp:post_type'][0] === 'post'))
      .map(parseWPPost)
      .map(processAttachments)
      .map(addThumb)
      .map(convertPostContentToMarkdown)
  )
  const result = await Promise.all(posts.map(writePostToFile))
}

function attachAttachments(posts: WPPost[], post: Post) {
  const attachments = posts.filter(p => {
    const parentId = parseInt(p['wp:post_parent'][0], 10)
    return p['wp:post_type'][0] === 'attachment' && parentId === post.id
  })

  return { ...post, attachments: attachments.map(a => a['wp:attachment_url'][0]) }
}

function writePostToFile(post: Post) {
  const output = `${makeFrontMatter(post)}\n${post.content}`
  const fileName = `${__dirname}/output/${post.slug}.md`
  return new Promise((resolve, reject) => {
    fs.writeFile(fileName, output, (err) => {
      if (err) {
        return reject(err)
      }
      return resolve(fileName)
    })
  })
}

function makeFrontMatter(post: Post) {
  return `
---
title: "${post.title}"
tags: ${post.tags.length ? JSON.stringify(post.tags.map(t => t.name)) : '[]'}
date: "${post.date}"
categories: ${post.categories.length ? JSON.stringify(post.categories.map(t => t.name)) : '[]'}
slug: "${post.slug}"
thumbnail: "${post.thumbnail || ''}"
---
`
}

function convertPostContentToMarkdown(post: Post) {
  return new Promise<Post>((resolve, reject) => {
    const md = toMarkdown(post.content)
    return resolve({ ...post, content: md })
  })
}

function parseWPPost(post: WPPostPost): Post {
  const categories = post.category
    .filter(c => c.$.domain === 'category')
    .map(c => ({ name: c._, slug: c.$.nicename }))

  const tags = post.category
    .filter(c => c.$.domain === 'post_tag')
    .map(c => ({ name: c._, slug: c.$.nicename }))

  return {
    id: parseInt(post['wp:post_id'][0], 10),
    title: post.title[0],
    slug: post['wp:post_name'][0] || kebabCase(post.title[0]),
    content: post['content:encoded'][0],
    date: post['wp:post_date'][0],
    categories,
    tags,
    attachments: [],
    meta: post['wp:postmeta']
  }
}

function getXml() {
  return new Promise<string>((resolve, reject) => {
    fs.readFile(__dirname + '/input.xml', (err, data) => {
      if (err) {
        return reject(err)
      }
      return resolve(data.toString())
    })
  })
}

function parseXml(xml: string) {
  return new Promise<WPPost[]>((resolve, reject) => {
    xml2js.parseString(xml, (err, result) => {
      if (err) {
        return reject(err)
      }
      return resolve(result.rss.channel[0].item)
    })
  })
}

function getPostThumbnail(posts: WPPost[], meta: WPPostMeta[]) {
  const thumbnailMeta = meta.find(item => item['wp:meta_key'][0] === '_thumbnail_id')
  if (!thumbnailMeta) {
    return null
  }

  const thumbnailId = parseInt(thumbnailMeta['wp:meta_value'][0], 10)

  const thumbnails = posts
    .filter(<(p) => p is WPPostAttachment>(p => {
      return parseInt(p['wp:post_id'][0], 10) === thumbnailId
    }))
    .map(a => a['wp:attachment_url'][0])

  return thumbnails[0] || null
}