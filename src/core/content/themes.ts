import { COURSES } from './levels';
import { wordById, type Word } from './words';

export type AlbumThemeId =
  | 'animals'
  | 'food'
  | 'nature'
  | 'body'
  | 'family'
  | 'home'
  | 'school'
  | 'travel'
  | 'sport'
  | 'basics';

export interface AlbumThemeDef {
  id: AlbumThemeId;
  title: string;
  coverWordId: string;
  accent: number;
}

export interface BookEntry {
  w: Word;
  from: string;
  theme: AlbumThemeId;
}

export const ALBUM_THEMES: readonly AlbumThemeDef[] = [
  { id: 'animals', title: '动物世界', coverWordId: 'panda', accent: 0x5ab872 },
  { id: 'food', title: '美食餐桌', coverWordId: 'apple', accent: 0xef8538 },
  { id: 'nature', title: '自然天气', coverWordId: 'sun', accent: 0x45add1 },
  { id: 'body', title: '身体与心情', coverWordId: 'smile', accent: 0xe26476 },
  { id: 'family', title: '人物与职业', coverWordId: 'mother', accent: 0x8f6ac8 },
  { id: 'home', title: '家与穿搭', coverWordId: 'house', accent: 0xd49635 },
  { id: 'school', title: '校园与科技', coverWordId: 'book', accent: 0x4e82d4 },
  { id: 'travel', title: '城市与出行', coverWordId: 'train', accent: 0x3b9f99 },
  { id: 'sport', title: '运动与玩乐', coverWordId: 'football', accent: 0xe36640 },
  { id: 'basics', title: '时间与常用', coverWordId: 'clock', accent: 0x7a8899 },
];

const YLE_UNIT_THEME: Record<string, AlbumThemeId> = {
  农场动物: 'animals',
  动物园: 'animals',
  小动物: 'animals',
  宠物: 'animals',
  野生动物: 'animals',

  水果: 'food',
  水果和蔬菜: 'food',
  早饭午饭: 'food',
  好吃的: 'food',
  吃和喝: 'food',
  '好吃的 2': 'food',
  餐桌: 'food',

  海边: 'nature',
  外面: 'nature',
  天气: 'nature',
  大自然: 'nature',
  山水: 'nature',

  身体: 'body',
  手和脚: 'body',
  心情: 'body',
  '心情 2': 'body',
  长相: 'body',
  高矮胖瘦: 'body',
  生病了: 'body',
  看医生: 'body',

  家人: 'family',
  身边的人: 'family',
  家里人: 'family',
  职业: 'family',

  我的家: 'home',
  家具: 'home',
  家里的东西: 'home',
  楼上楼下: 'home',
  洗漱: 'home',
  衣服: 'home',
  穿戴: 'home',
  '衣服 2': 'home',

  教室: 'school',
  文具: 'school',
  上课: 'school',
  字母和故事: 'school',
  课堂指令: 'school',
  学习: 'school',
  '学校 2': 'school',
  电脑和手机: 'school',

  交通: 'travel',
  城里: 'travel',
  去哪儿: 'travel',
  出门: 'travel',

  玩具: 'sport',
  球类运动: 'sport',
  玩一玩: 'sport',
  音乐和画画: 'sport',
  '运动 2': 'sport',
  玩乐: 'sport',
};

const KEYWORD_RULES: [AlbumThemeId, RegExp][] = [
  [
    'animals',
    /动物|宠物|昆虫|鸟|鱼|猫|狗|猪|牛|羊|马|驴|鸡|鸭|鹅|兔|鼠|虎|狮|象|熊|猴|狼|狐|鹿|蛇|蛙|龟|鲸|鲨|海豚|企鹅|袋鼠|斑马|长颈鹿|鳄鱼|河马|恐龙|蝴蝶|蜜蜂|蚂蚁|蜘蛛|蜗牛|蚊子|蜥蜴|骆驼|鹦鹉|章鱼|水母|天鹅|老鹰|翅膀|尾巴|毛皮|巢|兽医|物种|野生/,
  ],
  [
    'food',
    /水果|蔬菜|食物|食品|饮料|餐|早饭|早餐|午饭|午餐|晚饭|晚餐|夜宵|甜点|零食|菜|汤|肉|蛋|奶|茶|咖啡|果汁|汽水|可乐|水壶|面包|米饭|面条|饺子|披萨|汉堡|三明治|饼干|蛋糕|糖|巧克力|冰淇淋|奶酪|黄油|蜂蜜|果酱|沙拉|牛排|香肠|咖喱|意面|土豆|番茄|西红柿|洋葱|大蒜|胡萝卜|黄瓜|生菜|菠菜|西兰花|蘑菇|苹果|香蕉|梨|橙|橘|葡萄|西瓜|草莓|柠檬|芒果|桃|樱桃|烤|煮|煎|炸|炒|烘焙|厨|菜单|食谱|美味|好吃|酸|甜|苦|辣|咸|饿|渴|饮食|食材|调料|香料|辣椒|胡椒|盐/,
  ],
  [
    'nature',
    /天气|晴|阴|雨|雪|风|云|雾|雷|闪电|暴风|台风|彩虹|太阳|月亮|星星|天空|宇宙|地球|星球|山|峰|谷|河|湖|海|洋|溪|瀑布|岛|岸|滩|森林|树林|雨林|沙漠|草|花|树|叶|根|种子|农田|庄稼|气候|环境|自然|污染|回收|全球变暖|洪水|地震|冰|火|温度|四季|春天|夏天|秋天|冬天|日出|日落|阳光/,
  ],
  [
    'body',
    /身体|头|脸|眼|耳|鼻|嘴|口|唇|舌|牙|喉|脖|肩|臂|肘|手|指|拇指|胸|背|胃|肚|腿|膝|踝|脚|趾|皮肤|血|骨|心|脑|头发|胡子|健康|生病|病|痛|疼|感冒|发烧|咳嗽|流感|药|医院|诊所|急救|救护车|绷带|伤|流血|盲|聋|残疾|轮椅|呼吸|睡|醒|累|困|开心|高兴|快乐|难过|伤心|生气|愤怒|害怕|恐惧|担心|紧张|焦虑|惊讶|无聊|害羞|骄傲|羞愧|尴尬|孤独|嫉妒|感激|情绪|心情|感受|笑|哭/,
  ],
  [
    'family',
    /家|父母|爸|妈|父|母|兄|弟|姐|妹|哥|儿|女|夫|妻|爷|奶|外公|外婆|叔|伯|舅|姑|姨|堂|表|孙|侄|甥|亲戚|朋友|同学|邻居|同事|伙伴|同伴|男友|女友|婚礼|结婚|新郎|新娘|大人|成年|青少|孩子|宝宝|婴儿|老人|男人|女人|女士|先生|老师|教授|校长|医生|护士|警察|消防员|飞行员|司机|农民|厨师|工人|科学家|工程师|记者|作家|画家|歌手|演员|导演|音乐家|摄影师|律师|会计|老板|经理|秘书|服务员|售货员|理发师|修理工|导游|接待员|志愿者|选手|冠军|游客|客人|顾客|陌生人|职业|工作|雇员|雇主/,
  ],
  [
    'home',
    /房间|卧室|客厅|餐厅|厨房|浴室|卫生间|厕所|阳台|地下室|车库|楼上|楼下|屋顶|天花板|墙|地板|门|窗|楼梯|家具|床|桌|椅|沙发|柜|架|抽屉|灯|毯|枕|被|窗帘|地毯|镜|钟|冰箱|烤箱|微波炉|洗碗机|洗衣机|炉|暖气|空调|水龙头|水槽|浴缸|淋浴|毛巾|肥皂|洗发|牙刷|牙膏|梳|吹风机|伞|包|箱|钱包|钥匙|垃圾|家务|打扫|整洁|凌乱|衣服|服装|穿|戴|衫|衬衫|外套|夹克|毛衣|卫衣|连衣裙|裙|裤|牛仔|短裤|鞋|靴|袜|帽|围巾|手套|领带|腰带|眼镜|墨镜|泳衣|雨衣|睡衣|制服|内衣|项链|手镯|耳环|戒指|珠宝|棉|丝|毛|皮|条纹|时尚/,
  ],
  [
    'school',
    /学校|小学|中学|大学|学院|教室|课堂|操场|食堂|图书馆|实验室|课程|科目|语文|数学|英语|科学|物理|化学|生物|历史|地理|美术|体育|作业|考试|测验|分数|成绩|毕业|文凭|证书|课本|字典|词典|笔记本|书|小说|故事|诗|文章|作文|段落|句子|单词|词汇|语法|拼写|发音|字母|元音|辅音|标点|逗号|句号|黑板|粉笔|笔|尺|橡皮|剪刀|胶水|纸|文件夹|信封|电脑|笔记本电脑|平板|手机|电话|网络|网站|网页|邮件|短信|应用|软件|硬件|键盘|屏幕|打印|下载|上传|点击|密码|博客|播客|摄像头|科技|发明|实验|研究|信息|数据/,
  ],
  [
    'travel',
    /车|汽车|公交|巴士|火车|地铁|电车|出租车|自行车|单车|摩托|滑板车|飞机|直升机|船|渡轮|邮轮|车站|机场|港口|码头|站台|路|街道|公路|高速|路口|环岛|斑马线|人行道|桥|隧道|红绿灯|交通|堵车|停车|加油|城市|城镇|乡村|农村|首都|国家|地区|边界|地图|方向|指南|旅游|旅行|度假|行程|航班|护照|签证|海关|登机|行李|酒店|宾馆|旅馆|民宿|度假村|露营|帐篷|纪念品|景点|观光|建筑|城堡|宫殿|教堂|寺庙|博物馆|画廊|剧院|影院|公园|广场|市场|商店|超市|商场|百货|书店|药店|银行|邮局|警局|办公室|工厂|农场|农场|地址|入口|出口/,
  ],
  [
    'sport',
    /运动|体育|足球|篮球|排球|网球|羽毛球|乒乓球|棒球|橄榄球|曲棍球|冰球|板球|高尔夫|壁球|田径|跑步|跳高|跳远|游泳|潜水|冲浪|滑冰|滑雪|滑板|骑行|徒步|登山|钓鱼|瑜伽|健身|体操|拳击|赛车|比赛|竞赛|锦标赛|奥运|球队|教练|球场|泳池|球拍|球网|进球|得分|音乐|歌|唱|乐器|钢琴|吉他|小提琴|鼓|笛|号|乐队|交响|演唱会|音乐会|歌剧|舞|芭蕾|画|雕塑|摄影|电影|戏剧|喜剧|恐怖|动画|卡通|节目|舞台|表演|魔术|马戏|派对|聚会|节日|圣诞|万圣|感恩|生日|烟花|游戏|玩具|玩偶|风筝|棋|谜|笑话|爱好|收集|露营|野餐|娱乐/,
  ],
];

function buildYleThemeMap(): Map<string, AlbumThemeId> {
  const map = new Map<string, AlbumThemeId>();
  for (const course of COURSES) {
    if (course.id !== 'yle-starters' && course.id !== 'yle-movers') continue;
    for (const unit of course.units) {
      const theme = YLE_UNIT_THEME[unit.title];
      if (!theme) continue;
      for (const id of unit.words) {
        if (!map.has(id)) map.set(id, theme);
      }
    }
  }
  return map;
}

const YLE_THEME_MAP = buildYleThemeMap();

export function classifyWordTheme(w: Word): AlbumThemeId {
  const fromYle = YLE_THEME_MAP.get(w.id);
  if (fromYle) return fromYle;
  const zh = w.zh;
  for (const [theme, re] of KEYWORD_RULES) {
    if (re.test(zh)) return theme;
  }
  return 'basics';
}

export const BOOK_ENTRIES: readonly BookEntry[] = (() => {
  const list: BookEntry[] = [];
  const seen = new Set<string>();
  for (const course of COURSES) {
    course.units.forEach((unit, idx) => {
      const from = course.route === 'cambridge' ? `${course.short} 第 ${idx + 1} 单元` : `${course.short} ${unit.title}`;
      for (const id of unit.words) {
        if (!seen.has(id)) {
          const w = wordById(id);
          list.push({ w, from, theme: classifyWordTheme(w) });
          seen.add(id);
        }
      }
    });
  }
  return list;
})();

const BY_THEME: Record<AlbumThemeId, BookEntry[]> = {
  animals: [],
  food: [],
  nature: [],
  body: [],
  family: [],
  home: [],
  school: [],
  travel: [],
  sport: [],
  basics: [],
};

for (const entry of BOOK_ENTRIES) {
  BY_THEME[entry.theme].push(entry);
}

export function entriesForTheme(theme: AlbumThemeId | 'all'): readonly BookEntry[] {
  return theme === 'all' ? BOOK_ENTRIES : BY_THEME[theme];
}

export function themeDef(id: AlbumThemeId): AlbumThemeDef {
  return ALBUM_THEMES.find((t) => t.id === id)!;
}
