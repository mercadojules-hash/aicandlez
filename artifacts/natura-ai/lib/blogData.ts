import blogJSON from "../data/blog.json";

export type BlogPost = {
  id: string;
  title: string;
  category: string;
  categoryBg: string;
  categoryText: string;
  excerpt: string;
  content: string[];
  image: string;
  readTime: string;
  publishedAt: string;
};

export const BLOG_POSTS: BlogPost[] = blogJSON as BlogPost[];
