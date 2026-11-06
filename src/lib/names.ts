// 区分“公司名称”和“人名”：识别出公司就填公司名称，识别出人名就归到合同类型。

const ORG_WORDS =
  /公司|集团|有限|股份|企业|工厂|工程|科技|贸易|物流|咖啡|餐饮|传媒|文化|教育|医院|学校|商行|商贸|超市|药房|装饰|装修|建设|建筑|网络|信息|电子|实业|投资|咨询|事务所|工作室|酒店|宾馆|广告|合作社|俱乐部|幼儿园|银行|中心|协会|商店|门店|分店|旅行社|汽修|诊所|农场|养殖|传动|机械|设备|材料|能源|食品|服饰|家具|软件/;

const ORG_SUFFIX = /[厂店行社所院校场馆坊铺站部局会室]$/;

const COMPOUND = ["欧阳", "司马", "上官", "诸葛", "慕容", "夏侯", "东方", "皇甫", "尉迟", "公孙", "令狐", "长孙", "司徒", "独孤", "南宫"];
const SURNAMES =
  "王李张刘陈杨黄赵吴周徐孙马朱胡郭何林高罗郑梁谢宋唐许韩冯邓曹彭曾萧田董袁潘于蒋蔡余杜叶程苏魏吕丁任沈姚卢姜崔钟谭陆汪范金石廖贾夏韦付方白邹孟熊秦邱江尹薛闫段雷侯龙史陶黎贺顾毛郝龚邵万钱严覃武戴莫孔向汤";
const HONORIFIC = /(?:先生|女士|小姐|老板|老师|医生|师傅|经理|总)$/;

export function isCompanyName(name: string): boolean {
  const value = name.trim();
  if (!value) return false;
  return ORG_WORDS.test(value) || (value.length >= 3 && ORG_SUFFIX.test(value));
}

export function isPersonName(name: string): boolean {
  const value = name.trim();
  if (!value || !/^[\u4e00-\u9fff·]{2,5}$/.test(value) || isCompanyName(value)) return false;
  if (HONORIFIC.test(value) || /^[老小][\u4e00-\u9fff]$/.test(value)) return true;
  const compound = COMPOUND.find((item) => value.startsWith(item));
  if (compound) return value.length - compound.length >= 1 && value.length - compound.length <= 2;
  return SURNAMES.includes(value[0]) && value.length >= 2 && value.length <= 4;
}

/** 把识别出的名字分到两个字段：公司 → 公司名称；人名 → 合同类型（和合同种类拼在一起）。 */
export function splitName(name: string, kind: string): { company: string; type: string } {
  const value = name.trim();
  if (value && isPersonName(value)) return { company: "", type: `${value}${kind}` };
  return { company: value, type: kind };
}
