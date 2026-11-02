import { INITIAL_LANGUAGE_REGISTRY } from '../i18n/languages';

export interface MalviUsageCopy {
  direction: 'ltr' | 'rtl';
  allowanceLabel: string;
  timeLeft: string;
  checking: string;
  unavailable: string;
  low: string;
  urgent: string;
  exhausted: string;
  subscriptionTitle: string;
  subscriptionBody: string;
  subscribe: string;
  endAndViewPlans: string;
}

const EN: MalviUsageCopy = {
  direction: 'ltr',
  allowanceLabel: 'Malvi allowance',
  timeLeft: 'Malvi time left',
  checking: 'Checking remaining time',
  unavailable: 'Remaining time unavailable',
  low: 'One minute or less of Malvi time left',
  urgent: '30 seconds or less of Malvi time left',
  exhausted: 'Malvi time used up',
  subscriptionTitle: 'Malvi minutes used up',
  subscriptionBody: 'Your Malvi allowance is used up. Open Billing to review your plan.',
  subscribe: 'Subscribe',
  endAndViewPlans: 'End & view plans',
};

// Static interface copy, separate from conversation and speech-language routing.
// Initial translations are practical UI strings; have native speakers review before certification.
const COPY: Record<string, MalviUsageCopy> = {
  ak: {
    direction: 'ltr', allowanceLabel: 'Malvi bere', timeLeft: 'Malvi bere a aka',
    checking: 'Yɛrehwɛ bere a aka', unavailable: 'Yɛrentumi nhu bere a aka',
    low: 'Malvi bere simma baako anaa nea ennu saa na aka', urgent: 'Malvi bere sekɔnd 30 anaa nea ennu saa na aka',
    exhausted: 'Malvi bere no asa', subscriptionTitle: 'Malvi sima no asa',
    subscriptionBody: 'Wo ne Malvi bere no asa. Paw nhyehyɛe bi na toa wo nkɔmmɔbɔ no so.',
    subscribe: 'Hwɛ nhyehyɛe', endAndViewPlans: 'Gyae na hwɛ nhyehyɛe',
  },
  'tw-ak': {
    direction: 'ltr', allowanceLabel: 'Malvi bere', timeLeft: 'Malvi bere a aka',
    checking: 'Yɛrehwehwɛ bere a aka', unavailable: 'Yɛrentumi nkyerɛ bere a aka',
    low: 'Malvi bere simma baako anaa nea ennu saa na aka', urgent: 'Malvi bere sekɔnd 30 anaa nea ennu saa na aka',
    exhausted: 'Malvi bere no asa', subscriptionTitle: 'Malvi sima no asa',
    subscriptionBody: 'Wo ne Malvi bere no asa. Paw nhyehyɛe bi na toa wo nkɔmmɔbɔ no so.',
    subscribe: 'Hwɛ nhyehyɛe', endAndViewPlans: 'Gyae na hwɛ nhyehyɛe',
  },
  fat: {
    direction: 'ltr', allowanceLabel: 'Malvi bere sika', timeLeft: 'Malvi bere a aka',
    checking: 'Yɛrehwehwɛ bere a aka', unavailable: 'Yɛrentumi nhu bere a aka',
    low: 'Malvi bere sima kor anaa kakra na aka', urgent: 'Malvi bere sikani 30 anaa kakra na aka',
    exhausted: 'Malvi bere no etwa', subscriptionTitle: 'Malvi sima no etwa',
    subscriptionBody: 'Wo Malvi bere no etwa. Paw nhyehyɛe bi na toa wo nkɔmbɔdzɛ no do.',
    subscribe: 'Hwɛ nhyehyɛe', endAndViewPlans: 'Gyae na hwɛ nhyehyɛe',
  },
  yo: {
    direction: 'ltr', allowanceLabel: 'Àṣẹ̀dá àkókò Malvi', timeLeft: 'Àkókò Malvi tó kù',
    checking: 'Ń ṣàyẹ̀wò àkókò tó kù', unavailable: 'A kò lè rí àkókò tó kù',
    low: 'Ìṣẹ́jú kan tàbí díẹ̀ ló kù fún Malvi', urgent: 'Ìṣẹ́jú àáyá 30 tàbí díẹ̀ ló kù fún Malvi',
    exhausted: 'Àkókò Malvi ti tán', subscriptionTitle: 'Àkókò Malvi ti tán',
    subscriptionBody: 'Àkókò rẹ pẹ̀lú Malvi ti parí. Yan ètò kan láti tẹ̀síwájú nínú ìjíròrò rẹ.',
    subscribe: 'Wo àwọn ètò', endAndViewPlans: 'Parí kí o wo ètò',
  },
  ha: {
    direction: 'ltr', allowanceLabel: 'Lokacin Malvi', timeLeft: 'Lokacin Malvi da ya rage',
    checking: 'Ana duba lokacin da ya rage', unavailable: 'Ba a iya ganin lokacin da ya rage',
    low: 'Minti ɗaya ko ƙasa da haka na lokacin Malvi ya rage', urgent: 'Daƙiƙa 30 ko ƙasa da haka na lokacin Malvi ya rage',
    exhausted: 'Lokacin Malvi ya ƙare', subscriptionTitle: 'Lokacin Malvi ya ƙare',
    subscriptionBody: 'Lokacinka da Malvi ya ƙare. Zaɓi tsari don ci gaba da tattaunawarka.',
    subscribe: 'Duba tsare-tsare', endAndViewPlans: 'Ƙare ka duba tsare-tsare',
  },
  sw: {
    direction: 'ltr', allowanceLabel: 'Muda wa Malvi', timeLeft: 'Muda wa Malvi uliosalia',
    checking: 'Inakagua muda uliosalia', unavailable: 'Muda uliosalia haupatikani',
    low: 'Umesalia na dakika 60 au chini za muda wa Malvi', urgent: 'Umesalia na sekunde 30 au chini za muda wa Malvi',
    exhausted: 'Muda wa Malvi umeisha', subscriptionTitle: 'Muda wa Malvi umeisha',
    subscriptionBody: 'Muda wako na Malvi umeisha. Chagua mpango ili uendelee na mazungumzo.',
    subscribe: 'Tazama mipango', endAndViewPlans: 'Maliza na uone mipango',
  },
  lg: {
    direction: 'ltr', allowanceLabel: 'Ekiseera kya Malvi', timeLeft: 'Ekiseera kya Malvi ekisigadde',
    checking: 'Keekenneenya ekiseera ekisigadde', unavailable: 'Ekiseera ekisigadde tekisobola kulabibwa',
    low: 'Ekiseera kya Malvi ekisigadde eddakiika emu oba ntono', urgent: 'Ekiseera kya Malvi ekisigadde sikonda 30 oba ntono',
    exhausted: 'Ekiseera kya Malvi kiweddeko', subscriptionTitle: 'Ekiseera kya Malvi kiweddeko',
    subscriptionBody: 'Ekiseera kyo ne Malvi kiweddeko. Londa pulaani okweyongera mu mboozi yo.',
    subscribe: 'Laba pulaani', endAndViewPlans: 'Komeko olabe pulaani',
  },
  ig: {
    direction: 'ltr', allowanceLabel: 'Oge Malvi', timeLeft: 'Oge Malvi fọdụrụ',
    checking: 'A na-enyocha oge fọdụrụ', unavailable: 'Enweghị ike ịhụ oge fọdụrụ',
    low: 'Otu nkeji ma ọ bụ obere oge Malvi fọdụrụ', urgent: 'Sekọnd 30 ma ọ bụ obere oge Malvi fọdụrụ',
    exhausted: 'Oge Malvi agwụla', subscriptionTitle: 'Oge Malvi agwụla',
    subscriptionBody: 'Oge gị na Malvi agwụla. Họrọ atụmatụ ka ị gaa n’ihu na mkparịta ụka gị.',
    subscribe: 'Lee atụmatụ', endAndViewPlans: 'Kwụsị ma lee atụmatụ',
  },
  am: {
    direction: 'ltr', allowanceLabel: 'የማልቪ ጊዜ', timeLeft: 'የቀረው የማልቪ ጊዜ',
    checking: 'የቀረውን ጊዜ በመፈተሽ ላይ', unavailable: 'የቀረው ጊዜ አይገኝም',
    low: 'አንድ ደቂቃ ወይም ከዚያ ያነሰ የማልቪ ጊዜ ቀርቷል', urgent: '30 ሰከንድ ወይም ከዚያ ያነሰ የማልቪ ጊዜ ቀርቷል',
    exhausted: 'የማልቪ ጊዜ አልቋል', subscriptionTitle: 'የማልቪ ጊዜ አልቋል',
    subscriptionBody: 'ከማልቪ ጋር ያለዎት ጊዜ አልቋል። ውይይትዎን ለመቀጠል እቅድ ይምረጡ።',
    subscribe: 'እቅዶችን ይመልከቱ', endAndViewPlans: 'ጨርስ እና እቅዶችን ይመልከቱ',
  },
  ee: {
    direction: 'ltr', allowanceLabel: 'Malvi ɣeyiɣi', timeLeft: 'Malvi ɣeyiɣi si gbɔna',
    checking: 'Le ɣeyiɣi si gbɔna la kpɔm', unavailable: 'Mekpɔ ɣeyiɣi si gbɔna o',
    low: 'Malvi ɣeyiɣi si gbɔna ƒe miniti ɖeka alo sue wu', urgent: 'Malvi ɣeyiɣi si gbɔna ƒe sekend 30 alo sue wu',
    exhausted: 'Malvi ɣeyiɣi wu enu', subscriptionTitle: 'Malvi ɣeyiɣi wu enu',
    subscriptionBody: 'Wò ɣeyiɣi kple Malvi wu enu. Tia ɖoɖo be nàte ŋu ayia wò nyaɖeɖe.',
    subscribe: 'Kpɔ ɖoɖowo', endAndViewPlans: 'Wu enu eye nàkpɔ ɖoɖowo',
  },
  gaa: {
    direction: 'ltr', allowanceLabel: 'Malvi bere', timeLeft: 'Malvi bere ni hu',
    checking: 'Ehe ni akɛ bere ni hu', unavailable: 'Bere ni hu ebaata',
    low: 'Malvi bere ni hu ni sima baako anaa ni hee', urgent: 'Malvi bere ni hu ni sekɔnd 30 anaa ni hee',
    exhausted: 'Malvi bere ebaata', subscriptionTitle: 'Malvi bere ebaata',
    subscriptionBody: 'Wo Malvi bere ebaata. Yɛ nhyehyɛɛ bi ni wo aha wo nkɔmɔ.',
    subscribe: 'Kɛ nhyehyɛɛ', endAndViewPlans: 'Gyae kɛ nhyehyɛɛ',
  },
  zu: {
    direction: 'ltr', allowanceLabel: 'Isikhathi sikaMalvi', timeLeft: 'Isikhathi sikaMalvi esisele',
    checking: 'Ihlola isikhathi esisele', unavailable: 'Isikhathi esisele asitholakali',
    low: 'Kusele umzuzu owodwa noma ngaphansi wesikhathi sikaMalvi', urgent: 'Kusele imizuzwana engu-30 noma ngaphansi yesikhathi sikaMalvi',
    exhausted: 'Isikhathi sikaMalvi siphelile', subscriptionTitle: 'Isikhathi sikaMalvi siphelile',
    subscriptionBody: 'Isikhathi sakho noMalvi siphelile. Khetha uhlelo ukuze uqhubeke nengxoxo yakho.',
    subscribe: 'Buka izinhlelo', endAndViewPlans: 'Qeda ubuke izinhlelo',
  },
  xh: {
    direction: 'ltr', allowanceLabel: 'Ixesha likaMalvi', timeLeft: 'Ixesha likaMalvi eliseleyo',
    checking: 'Kujongwa ixesha eliseleyo', unavailable: 'Ixesha eliseleyo alifumaneki',
    low: 'Kusele umzuzu omnye okanye ngaphantsi wexesha likaMalvi', urgent: 'Kusele imizuzwana engama-30 okanye ngaphantsi yexesha likaMalvi',
    exhausted: 'Ixesha likaMalvi liphelile', subscriptionTitle: 'Ixesha likaMalvi liphelile',
    subscriptionBody: 'Ixesha lakho noMalvi liphelile. Khetha isicwangciso ukuze uqhubeke nencoko yakho.',
    subscribe: 'Jonga izicwangciso', endAndViewPlans: 'Gqiba uze ujonge izicwangciso',
  },
  so: {
    direction: 'ltr', allowanceLabel: 'Waqtiga Malvi', timeLeft: 'Waqtiga Malvi ee haray',
    checking: 'Waa la hubinayaa waqtiga haray', unavailable: 'Waqtiga haray lama heli karo',
    low: 'Hal daqiiqo ama ka yar ayaa ka haray waqtiga Malvi', urgent: '30 ilbiriqsi ama ka yar ayaa ka haray waqtiga Malvi',
    exhausted: 'Waqtigii Malvi wuu dhammaaday', subscriptionTitle: 'Waqtigii Malvi wuu dhammaaday',
    subscriptionBody: 'Waqtigii aad Malvi la lahayd wuu dhammaaday. Dooro qorshe si aad sheekada u sii wadato.',
    subscribe: 'Eeg qorshayaasha', endAndViewPlans: 'Jooji oo eeg qorshayaasha',
  },
  wo: {
    direction: 'ltr', allowanceLabel: 'Waxtu Malvi', timeLeft: 'Waxtu Malvi wi des',
    checking: 'Mi ngi seet waxtu wi des', unavailable: 'Mënul ñu gis waxtu wi des',
    low: 'Des na benn minit walla lu ko ëppul ci waxtu Malvi', urgent: 'Des na 30 sekond walla lu ko ëppul ci waxtu Malvi',
    exhausted: 'Waxtu Malvi jeex na', subscriptionTitle: 'Waxtu Malvi jeex na',
    subscriptionBody: 'Sa waxtu ak Malvi jeex na. Tànnal pogram ngir kontine sa waxtaan.',
    subscribe: 'Seetal pogram yi', endAndViewPlans: 'Jeexal te seetal pogram yi',
  },
  en: EN,
  fr: {
    direction: 'ltr', allowanceLabel: 'Temps Malvi', timeLeft: 'Temps Malvi restant',
    checking: 'Vérification du temps restant', unavailable: 'Temps restant indisponible',
    low: 'Il reste une minute ou moins de temps Malvi', urgent: 'Il reste 30 secondes ou moins de temps Malvi',
    exhausted: 'Temps Malvi épuisé', subscriptionTitle: 'Votre temps Malvi est épuisé',
    subscriptionBody: 'Votre temps avec Malvi est terminé. Choisissez une offre pour poursuivre la conversation.',
    subscribe: 'Voir les offres', endAndViewPlans: 'Terminer et voir les offres',
  },
  ar: {
    direction: 'rtl', allowanceLabel: 'رصيد وقت مالفي', timeLeft: 'الوقت المتبقي لمالفي',
    checking: 'جارٍ التحقق من الوقت المتبقي', unavailable: 'الوقت المتبقي غير متاح',
    low: 'بقيت دقيقة واحدة أو أقل من وقت مالفي', urgent: 'بقيت 30 ثانية أو أقل من وقت مالفي',
    exhausted: 'انتهى وقت مالفي', subscriptionTitle: 'انتهى وقت مالفي',
    subscriptionBody: 'انتهى وقتك مع مالفي. اختر خطة لمتابعة محادثتك.',
    subscribe: 'عرض الخطط', endAndViewPlans: 'إنهاء وعرض الخطط',
  },
  es: {
    direction: 'ltr', allowanceLabel: 'Tiempo de Malvi', timeLeft: 'Tiempo de Malvi restante',
    checking: 'Comprobando el tiempo restante', unavailable: 'Tiempo restante no disponible',
    low: 'Queda un minuto o menos de tiempo de Malvi', urgent: 'Quedan 30 segundos o menos de tiempo de Malvi',
    exhausted: 'Se agotó el tiempo de Malvi', subscriptionTitle: 'Se agotó el tiempo de Malvi',
    subscriptionBody: 'Tu tiempo con Malvi terminó. Elige un plan para continuar la conversación.',
    subscribe: 'Ver planes', endAndViewPlans: 'Terminar y ver planes',
  },
  zh: {
    direction: 'ltr', allowanceLabel: 'Malvi 时长', timeLeft: 'Malvi 剩余时长',
    checking: '正在检查剩余时长', unavailable: '无法获取剩余时长',
    low: 'Malvi 剩余时长不足一分钟', urgent: 'Malvi 剩余时长不足 30 秒',
    exhausted: 'Malvi 时长已用完', subscriptionTitle: 'Malvi 时长已用完',
    subscriptionBody: '你与 Malvi 的时长已结束。选择套餐以继续对话。',
    subscribe: '查看套餐', endAndViewPlans: '结束并查看套餐',
  },
  de: {
    direction: 'ltr', allowanceLabel: 'Malvi-Zeit', timeLeft: 'Verbleibende Malvi-Zeit',
    checking: 'Verbleibende Zeit wird geprüft', unavailable: 'Verbleibende Zeit nicht verfügbar',
    low: 'Noch höchstens eine Minute Malvi-Zeit', urgent: 'Noch höchstens 30 Sekunden Malvi-Zeit',
    exhausted: 'Malvi-Zeit aufgebraucht', subscriptionTitle: 'Malvi-Zeit aufgebraucht',
    subscriptionBody: 'Deine Zeit mit Malvi ist abgelaufen. Wähle einen Tarif, um das Gespräch fortzusetzen.',
    subscribe: 'Tarife ansehen', endAndViewPlans: 'Beenden und Tarife ansehen',
  },
  pt: {
    direction: 'ltr', allowanceLabel: 'Tempo Malvi', timeLeft: 'Tempo Malvi restante',
    checking: 'A verificar o tempo restante', unavailable: 'Tempo restante indisponível',
    low: 'Resta um minuto ou menos de tempo Malvi', urgent: 'Restam 30 segundos ou menos de tempo Malvi',
    exhausted: 'O tempo Malvi terminou', subscriptionTitle: 'O tempo Malvi terminou',
    subscriptionBody: 'O teu tempo com Malvi terminou. Escolhe um plano para continuar a conversa.',
    subscribe: 'Ver planos', endAndViewPlans: 'Terminar e ver planos',
  },
  hi: {
    direction: 'ltr', allowanceLabel: 'माल्वी समय', timeLeft: 'माल्वी का शेष समय',
    checking: 'शेष समय जाँचा जा रहा है', unavailable: 'शेष समय उपलब्ध नहीं है',
    low: 'माल्वी का एक मिनट या उससे कम समय शेष है', urgent: 'माल्वी के 30 सेकंड या उससे कम समय शेष हैं',
    exhausted: 'माल्वी का समय समाप्त हो गया', subscriptionTitle: 'माल्वी का समय समाप्त हो गया',
    subscriptionBody: 'माल्वी के साथ आपका समय समाप्त हो गया है। बातचीत जारी रखने के लिए कोई प्लान चुनें।',
    subscribe: 'प्लान देखें', endAndViewPlans: 'समाप्त करें और प्लान देखें',
  },
  ja: {
    direction: 'ltr', allowanceLabel: 'Malvi 利用時間', timeLeft: 'Malvi の残り時間',
    checking: '残り時間を確認中', unavailable: '残り時間を取得できません',
    low: 'Malvi の残り時間は1分以内です', urgent: 'Malvi の残り時間は30秒以内です',
    exhausted: 'Malvi の利用時間が終了しました', subscriptionTitle: 'Malvi の利用時間が終了しました',
    subscriptionBody: 'Malvi の利用時間が終了しました。会話を続けるにはプランを選択してください。',
    subscribe: 'プランを見る', endAndViewPlans: '終了してプランを見る',
  },
  it: {
    direction: 'ltr', allowanceLabel: 'Tempo Malvi', timeLeft: 'Tempo Malvi rimanente',
    checking: 'Verifica del tempo rimanente', unavailable: 'Tempo rimanente non disponibile',
    low: 'Resta un minuto o meno di tempo Malvi', urgent: 'Restano 30 secondi o meno di tempo Malvi',
    exhausted: 'Tempo Malvi esaurito', subscriptionTitle: 'Tempo Malvi esaurito',
    subscriptionBody: 'Il tempo con Malvi è terminato. Scegli un piano per continuare la conversazione.',
    subscribe: 'Vedi i piani', endAndViewPlans: 'Termina e vedi i piani',
  },
  ru: {
    direction: 'ltr', allowanceLabel: 'Время Malvi', timeLeft: 'Осталось времени Malvi',
    checking: 'Проверяем оставшееся время', unavailable: 'Оставшееся время недоступно',
    low: 'Осталась одна минута или меньше времени Malvi', urgent: 'Осталось 30 секунд или меньше времени Malvi',
    exhausted: 'Время Malvi закончилось', subscriptionTitle: 'Время Malvi закончилось',
    subscriptionBody: 'Ваше время с Malvi закончилось. Выберите план, чтобы продолжить разговор.',
    subscribe: 'Посмотреть планы', endAndViewPlans: 'Завершить и посмотреть планы',
  },
  tr: {
    direction: 'ltr', allowanceLabel: 'Malvi süresi', timeLeft: 'Kalan Malvi süresi',
    checking: 'Kalan süre kontrol ediliyor', unavailable: 'Kalan süre alınamıyor',
    low: 'Bir dakika veya daha az Malvi süresi kaldı', urgent: '30 saniye veya daha az Malvi süresi kaldı',
    exhausted: 'Malvi süresi tükendi', subscriptionTitle: 'Malvi süresi tükendi',
    subscriptionBody: 'Malvi ile görüşme süreniz bitti. Sohbete devam etmek için bir plan seçin.',
    subscribe: 'Planları gör', endAndViewPlans: 'Bitir ve planları gör',
  },
  ko: {
    direction: 'ltr', allowanceLabel: 'Malvi 이용 시간', timeLeft: 'Malvi 남은 시간',
    checking: '남은 시간을 확인하는 중', unavailable: '남은 시간을 확인할 수 없습니다',
    low: 'Malvi 이용 시간이 1분 이하 남았습니다', urgent: 'Malvi 이용 시간이 30초 이하 남았습니다',
    exhausted: 'Malvi 이용 시간이 끝났습니다', subscriptionTitle: 'Malvi 이용 시간이 끝났습니다',
    subscriptionBody: 'Malvi와의 이용 시간이 끝났습니다. 대화를 이어가려면 요금제를 선택하세요.',
    subscribe: '요금제 보기', endAndViewPlans: '종료하고 요금제 보기',
  },
  nl: {
    direction: 'ltr', allowanceLabel: 'Malvi-tijd', timeLeft: 'Resterende Malvi-tijd',
    checking: 'Resterende tijd controleren', unavailable: 'Resterende tijd niet beschikbaar',
    low: 'Nog één minuut of minder Malvi-tijd', urgent: 'Nog 30 seconden of minder Malvi-tijd',
    exhausted: 'Malvi-tijd is op', subscriptionTitle: 'Je Malvi-tijd is op',
    subscriptionBody: 'Je tijd met Malvi is voorbij. Kies een abonnement om het gesprek voort te zetten.',
    subscribe: 'Abonnementen bekijken', endAndViewPlans: 'Beëindigen en abonnementen bekijken',
  },
  id: {
    direction: 'ltr', allowanceLabel: 'Waktu Malvi', timeLeft: 'Sisa waktu Malvi',
    checking: 'Memeriksa sisa waktu', unavailable: 'Sisa waktu tidak tersedia',
    low: 'Sisa waktu Malvi satu menit atau kurang', urgent: 'Sisa waktu Malvi 30 detik atau kurang',
    exhausted: 'Waktu Malvi habis', subscriptionTitle: 'Waktu Malvi habis',
    subscriptionBody: 'Waktu Anda bersama Malvi telah berakhir. Pilih paket untuk melanjutkan percakapan.',
    subscribe: 'Lihat paket', endAndViewPlans: 'Akhiri dan lihat paket',
  },
  vi: {
    direction: 'ltr', allowanceLabel: 'Thời lượng Malvi', timeLeft: 'Thời lượng Malvi còn lại',
    checking: 'Đang kiểm tra thời lượng còn lại', unavailable: 'Không có thông tin thời lượng còn lại',
    low: 'Thời lượng Malvi còn một phút hoặc ít hơn', urgent: 'Thời lượng Malvi còn 30 giây hoặc ít hơn',
    exhausted: 'Đã hết thời lượng Malvi', subscriptionTitle: 'Đã hết thời lượng Malvi',
    subscriptionBody: 'Thời lượng trò chuyện với Malvi đã kết thúc. Chọn gói để tiếp tục cuộc trò chuyện.',
    subscribe: 'Xem các gói', endAndViewPlans: 'Kết thúc và xem các gói',
  },
  th: {
    direction: 'ltr', allowanceLabel: 'เวลา Malvi', timeLeft: 'เวลา Malvi ที่เหลือ',
    checking: 'กำลังตรวจสอบเวลาที่เหลือ', unavailable: 'ไม่สามารถดูเวลาที่เหลือได้',
    low: 'เหลือเวลา Malvi ไม่เกิน 1 นาที', urgent: 'เหลือเวลา Malvi ไม่เกิน 30 วินาที',
    exhausted: 'เวลา Malvi หมดแล้ว', subscriptionTitle: 'เวลา Malvi หมดแล้ว',
    subscriptionBody: 'เวลาของคุณกับ Malvi หมดแล้ว เลือกแพ็กเกจเพื่อสนทนาต่อ',
    subscribe: 'ดูแพ็กเกจ', endAndViewPlans: 'จบและดูแพ็กเกจ',
  },
  bn: {
    direction: 'ltr', allowanceLabel: 'মালভির সময়', timeLeft: 'মালভির অবশিষ্ট সময়',
    checking: 'অবশিষ্ট সময় পরীক্ষা করা হচ্ছে', unavailable: 'অবশিষ্ট সময় পাওয়া যাচ্ছে না',
    low: 'মালভির এক মিনিট বা তার কম সময় বাকি', urgent: 'মালভির ৩০ সেকেন্ড বা তার কম সময় বাকি',
    exhausted: 'মালভির সময় শেষ', subscriptionTitle: 'মালভির সময় শেষ',
    subscriptionBody: 'মালভির সঙ্গে আপনার সময় শেষ হয়েছে। কথোপকথন চালিয়ে যেতে একটি প্ল্যান বেছে নিন।',
    subscribe: 'প্ল্যান দেখুন', endAndViewPlans: 'শেষ করে প্ল্যান দেখুন',
  },
  pl: {
    direction: 'ltr', allowanceLabel: 'Czas Malvi', timeLeft: 'Pozostały czas Malvi',
    checking: 'Sprawdzanie pozostałego czasu', unavailable: 'Pozostały czas jest niedostępny',
    low: 'Pozostała minuta lub mniej czasu Malvi', urgent: 'Pozostało 30 sekund lub mniej czasu Malvi',
    exhausted: 'Czas Malvi się skończył', subscriptionTitle: 'Czas Malvi się skończył',
    subscriptionBody: 'Twój czas z Malvi dobiegł końca. Wybierz plan, aby kontynuować rozmowę.',
    subscribe: 'Zobacz plany', endAndViewPlans: 'Zakończ i zobacz plany',
  },
};

const normalized = (value: string) => value.trim().toLocaleLowerCase().replaceAll('_', '-');

export function getMalviUsageCopy(localeCode?: string | null): MalviUsageCopy {
  if (!localeCode) return EN;
  const locale = normalized(localeCode);
  const registryItem = INITIAL_LANGUAGE_REGISTRY.find(item =>
    normalized(item.code) === locale || normalized(item.locale) === locale
  );
  const resolvedCode = registryItem?.code || locale.split('-')[0];
  return COPY[resolvedCode] || EN;
}

export const MALVI_USAGE_COPY_CODES = Object.freeze(Object.keys(COPY));
