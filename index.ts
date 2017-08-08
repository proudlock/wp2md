import * as xml2js from 'xml2js'
import * as toMarkdown from 'to-markdown'
import * as fs from 'fs'
import { kebabCase } from 'lodash'

run()

interface WPPost {
  title: [string]
  'wp:post_date': [string]
  'wp:post_name': [string]
  'content:encoded': [string]
  'wp:post_type': 'post' | 'page' | 'nav_menu_item'
  category: WPCategory[]
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
  title: string
  slug: string
  content: string
  date: string
  categories: Taxonomy[]
  tags: Taxonomy[]
}

async function run() {
  const xml = await getXml()
  const wpPosts = await parseXml(xml)

  const posts = await Promise.all(
    wpPosts
      .filter(p => p['wp:post_type'][0] === 'post')
      .map(parseWPPost)
      .map(convertPostContentToMarkdown)
  )
  const result = await Promise.all(posts.map(writePostToFile))

  console.log(result)
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
---
`
}

function convertPostContentToMarkdown(post: Post) {
  return new Promise<Post>((resolve, reject) => {
    const md = toMarkdown(post.content)
    return resolve({ ...post, content: md })
  })
}

function parseWPPost(post: WPPost): Post {
  const categories = post.category
    .filter(c => c.$.domain === 'category')
    .map(c => ({ name: c._, slug: c.$.nicename }))

  const tags = post.category
    .filter(c => c.$.domain === 'post_tag')
    .map(c => ({ name: c._, slug: c.$.nicename }))

  return {
    title: post.title[0],
    slug: post['wp:post_name'][0] || kebabCase(post.title[0]),
    content: post['content:encoded'][0],
    date: post['wp:post_date'][0],
    categories,
    tags,
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