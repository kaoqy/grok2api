import { useQueryClient } from "@tanstack/react-query";
import { Images, RefreshCw, Video } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GalleryPage } from "@/features/media/gallery-page";
import { VideoGalleryPage } from "@/features/media/video-gallery-page";
import { PageHeader } from "@/shared/components/page-header";

// MediaLibraryPage 把图片与视频合并成一个图库：两者共用标题、刷新与分页节奏，
// 管理员不必再记住两个彼此独立的入口。
export function MediaLibraryPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [refreshing, setRefreshing] = useState(false);
  const tab = params.get("tab") === "videos" ? "videos" : "images";

  function changeTab(value: string) {
    setParams(value === "videos" ? { tab: "videos" } : {}, { replace: true });
  }

  function refreshAll() {
    setRefreshing(true);
    void queryClient.invalidateQueries({ queryKey: ["media"] }).finally(() => setRefreshing(false));
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={t("media.library.title")}
        description={t("media.library.description")}
        actions={(
          <Button variant="secondary" size="sm" onClick={refreshAll} disabled={refreshing}>
            <RefreshCw className={refreshing ? "animate-spin" : undefined} />
            {t("common.refresh")}
          </Button>
        )}
      />
      <Tabs value={tab} onValueChange={changeTab} className="gap-4">
        <TabsList className="h-9 w-fit">
          <TabsTrigger value="images" className="gap-1.5 px-3 text-xs">
            <Images className="size-3.5" />
            {t("media.library.images")}
          </TabsTrigger>
          <TabsTrigger value="videos" className="gap-1.5 px-3 text-xs">
            <Video className="size-3.5" />
            {t("media.library.videos")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="images" className="m-0"><GalleryPage embedded /></TabsContent>
        <TabsContent value="videos" className="m-0"><VideoGalleryPage embedded /></TabsContent>
      </Tabs>
    </div>
  );
}
