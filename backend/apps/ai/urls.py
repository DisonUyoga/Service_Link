from django.urls import path

from .api import AiMatchProvidersView, AiFeedbackSummaryView, AiPricePredictionView

urlpatterns = [
    path("match-providers/", AiMatchProvidersView.as_view(), name="ai-match-providers"),
    path("predict-price/", AiPricePredictionView.as_view(), name="ai-predict-price"),
    path("feedback-summary/", AiFeedbackSummaryView.as_view(), name="ai-feedback-summary"),
]

